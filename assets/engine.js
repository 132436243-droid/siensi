/* =========================================================
   情報処理安全確保支援士 午後問題 演習サイト
   共通エンジン：採点ロジック ＋ マーカー機能
   （AIによる採点は行わない。文字集合の類似度ベースで採点）
========================================================= */

/* ---------------- 採点ロジック ---------------- */

function toHalfWidth(str) {
  return str.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 65248));
}

function normalize(str) {
  return toHalfWidth(str)
    .replace(/[\s、。，,]+/g, "")
    .replace(/[－―]+/g, "-")
    .toLowerCase();
}

// 文字集合ベースのコサイン類似度（0〜1）
function charSetSimilarity(a, b) {
  const stop = ["を", "に", "が", "は", "、", "，", "。"];
  const arrA = Array.from(a);
  const arrB = Array.from(b);
  const union = [];
  for (const ch of arrA) if (!stop.includes(ch) && !union.includes(ch)) union.push(ch);
  for (const ch of arrB) if (!stop.includes(ch) && !union.includes(ch)) union.push(ch);
  if (union.length === 0) return 0;

  let inA = 0, inB = 0, both = 0;
  for (const ch of union) {
    const hasA = arrA.includes(ch);
    const hasB = arrB.includes(ch);
    if (hasA) inA++;
    if (hasB) inB++;
    if (hasA && hasB) both++;
  }
  if (inA === 0 || inB === 0) return 0;
  return both / (Math.sqrt(inA) * Math.sqrt(inB));
}

// 1つの解答欄を採点する
function scoreAnswer(answer, correctList, maxLen) {
  const userNorm = normalize(answer);
  if (!userNorm) return { ratio: 0, similarity: 0, grade: "batu" };

  let bestSim = 0;
  for (const c of correctList) {
    const sim = charSetSimilarity(userNorm, normalize(c));
    if (sim > bestSim) bestSim = sim;
  }

  // 極端に短い解答への減点
  if (maxLen && maxLen / userNorm.length > 2) {
    bestSim = bestSim / 4;
  }

  const pct = bestSim * 100;

  // 段階式：90%以上=満点／60%以上=70%／30%以上=30%／それ未満=0点
  let ratio, grade;
  if (pct >= 90)      { ratio = 1.0; grade = "maru"; }
  else if (pct >= 60) { ratio = 0.7; grade = "maru"; }
  else if (pct >= 30) { ratio = 0.3; grade = "sankaku"; }
  else                { ratio = 0.0; grade = "batu"; }

  return { ratio, similarity: pct, grade };
}

/* ---------------- UI連携：文字数カウンタ ---------------- */

function initCharCounters() {
  document.querySelectorAll(".qa-item textarea").forEach(ta => {
    const counter = ta.nextElementSibling;
    if (!counter || !counter.classList.contains("charcount")) return;
    const max = ta.getAttribute("maxlength");
    ta.addEventListener("input", () => {
      counter.textContent = ta.value.length + "/" + max;
    });
  });
}

/* ---------------- 採点ボタン ---------------- */

function initGrading() {
  const btn = document.getElementById("gradeBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const items = document.querySelectorAll(".qa-item");
    let totalScore = 0, totalMax = 0;

    items.forEach(item => {
      const points = parseInt(item.getAttribute("data-points"), 10) || 0;
      const fields = item.querySelectorAll(".field-row");
      let itemRatioSum = 0;
      let resultHtml = "";
      let worstGrade = "maru";

      fields.forEach(field => {
        const ta = field.querySelector("textarea");
        const maxLen = parseInt(ta.getAttribute("maxlength"), 10);
        const correctMain = field.getAttribute("data-answer");
        const alt = field.getAttribute("data-alt") || "";
        const correctList = [correctMain, ...alt.split("|").filter(Boolean)];
        const label = field.getAttribute("data-label") || "";

        const { ratio, similarity, grade } = scoreAnswer(ta.value, correctList, maxLen);
        itemRatioSum += ratio;

        if (grade === "batu") worstGrade = "batu";
        else if (grade === "sankaku" && worstGrade !== "batu") worstGrade = "sankaku";

        const labelText = grade === "maru" ? (ratio === 1.0 ? "正解" : "部分点")
                         : grade === "sankaku" ? "部分点(小)"
                         : "不正解";

        resultHtml += `<div><span class="label ${grade==='maru'?'ok':grade==='sankaku'?'partial':'ng'}" style="background:${grade==='maru'?'var(--maru)':grade==='sankaku'?'var(--sankaku)':'var(--batu)'}">${labelText}</span>${label ? label + '：' : ''}類似度 ${similarity.toFixed(1)}%　<b>模範解答：</b>${correctMain}</div>`;
      });

      const avgRatio = fields.length ? itemRatioSum / fields.length : 0;
      const earned = Math.round(points * avgRatio);
      totalScore += earned;
      totalMax += points;

      const resultBox = item.querySelector(".result-box");
      resultBox.className = "result-box show " + worstGrade;
      resultBox.innerHTML =
        `<div class="score-line">${earned} / ${points} 点</div>` + resultHtml;
    });

    const summary = document.getElementById("scoreSummary");
    if (summary) {
      summary.classList.add("show");
      summary.innerHTML = `合計得点：<span>${totalScore}</span> / ${totalMax} 点`;
    }
    btn.textContent = "採点済み（再採点する）";
  });
}

/* =========================================================
   試験画面（CBTシミュレーター風）
   問題ページのDOMを 2ペイン構成に組み替える。
   設定値は下の EXAM_CONFIG で変更できる。
========================================================= */

const EXAM_CONFIG = {
  totalMinutes: 150,          // 試験時間（分）
  warnMinutes: 10,            // 残りこの分数以下で赤表示
  memoMaxChars: 10000,        // メモの最大文字数
  pages: ["q1.html", "q2.html", "q3.html", "q4.html"],
  indexPage: "index.html",
  storage: { deadline: "siensi_deadline", memo: "siensi_memo", invert: "siensi_invert" }
};

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
function h(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
}

/* ---------------- レイアウト組み替え ---------------- */

function initLayout() {
  const wrap = document.querySelector(".wrap");
  const mondai = document.querySelector(".mondai");
  if (!wrap || !mondai) return null;           // index.html など

  document.body.classList.add("exam");
  const titleText = (wrap.querySelector("h1") || {}).textContent || document.title;
  const metaText = (wrap.querySelector(".meta") || {}).textContent || "";

  const bodyNodes = Array.from(wrap.children);
  const answers = h("div", "answers");
  bodyNodes.forEach(el => {
    if (el.matches("h2.setumon, .qa-item, #gradeBtn, #scoreSummary, .note")) answers.appendChild(el);
  });
  const note = answers.querySelector(".note");
  if (note) answers.appendChild(note);

  // 左ペイン
  const left = h("section", "pane");
  const toolbar = h("div", "mk-toolbar", `
    <span>拡大・縮小</span>
    <input type="range" id="zoomRange" min="70" max="200" step="10" value="100">
    <span id="zoomVal">100 %</span>
    <button type="button" class="mk-tool on" data-tool="pointer" title="選択">⌖</button>
    <button type="button" class="mk-tool" data-tool="red" title="赤マーカー"></button>
    <button type="button" class="mk-tool" data-tool="blue" title="青マーカー"></button>
    <button type="button" class="mk-tool" data-tool="yellow" title="黄マーカー"></button>
    <button type="button" class="mk-tool" data-tool="eraser" title="消しゴム（マーカーをクリックで消去）">⌫</button>
    <button type="button" class="btn navy" id="mkClear">クリア</button>`);
  const leftScroll = h("div", "pane-scroll");
  leftScroll.appendChild(mondai);
  left.append(toolbar, leftScroll);

  // 右ペイン
  const right = h("section", "pane");
  const rightScroll = h("div", "pane-scroll");
  rightScroll.appendChild(answers);
  right.appendChild(rightScroll);

  const main = h("div", "exam-main");
  main.append(left, right);

  // ヘッダー
  const header = h("header", "exam-header");
  header.innerHTML = `
    <div><div class="exam-logo">SC</div></div>
    <div class="exam-title"><div class="t"></div><div class="s"></div></div>
    <div class="exam-right">
      <div class="exam-timer" id="examTimer">残り時間 <b>--:--:--</b><button type="button" id="timerReset" title="タイマーをリセット">⟲</button></div>
      <div class="invert-wrap">白黒反転<label class="switch"><input type="checkbox" id="invertToggle"><span></span></label></div>
      <button type="button" class="btn navy" id="memoBtn">メモ</button>
      <a class="btn navy" href="${EXAM_CONFIG.indexPage}">問題一覧</a>
      <button type="button" class="btn navy" id="finishBtn">確認終了</button>
    </div>`;
  header.querySelector(".t").textContent = titleText;
  header.querySelector(".s").textContent = metaText;

  // フッター
  const cur = location.pathname.split("/").pop() || "";
  const idx = EXAM_CONFIG.pages.indexOf(cur);
  const prev = idx > 0 ? EXAM_CONFIG.pages[idx - 1] : null;
  const next = idx >= 0 && idx < EXAM_CONFIG.pages.length - 1 ? EXAM_CONFIG.pages[idx + 1] : null;
  const footer = h("footer", "exam-footer");
  footer.innerHTML = `
    <button type="button" class="btn navy" id="statusBtn">解答状況</button>
    <div class="status-panel" id="statusPanel"></div>
    <span class="grow"></span>
    <a class="btn navy ${prev ? "" : "disabled"}" ${prev ? `href="${prev}"` : ""}>前の問題</a>
    <a class="btn navy ${next ? "" : "disabled"}" ${next ? `href="${next}"` : ""}>次の問題</a>`;

  document.body.innerHTML = "";
  document.body.append(header, main, footer);
  return { mondai, answers, rightScroll };
}

/* ---------------- 白黒反転 ---------------- */

function initInvert() {
  const t = document.getElementById("invertToggle");
  const apply = on => document.documentElement.classList.toggle("invert", on);
  const on = lsGet(EXAM_CONFIG.storage.invert) === "1";
  apply(on);
  if (!t) return;
  t.checked = on;
  t.addEventListener("change", () => {
    apply(t.checked);
    lsSet(EXAM_CONFIG.storage.invert, t.checked ? "1" : "0");
  });
}

/* ---------------- 残り時間タイマー（ページをまたいで継続） ---------------- */

function initTimer() {
  const box = document.getElementById("examTimer");
  if (!box) return;
  const out = box.querySelector("b");
  const K = EXAM_CONFIG.storage.deadline;
  let deadline = parseInt(lsGet(K), 10);
  const start = () => {
    deadline = Date.now() + EXAM_CONFIG.totalMinutes * 60000;
    lsSet(K, String(deadline));
  };
  if (!deadline) start();

  let notified = false;
  function tick() {
    const rest = Math.max(0, deadline - Date.now());
    const sec = Math.ceil(rest / 1000);
    const hh = Math.floor(sec / 3600), mm = Math.floor(sec % 3600 / 60), ss = sec % 60;
    out.textContent = `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    box.classList.toggle("warn", rest <= EXAM_CONFIG.warnMinutes * 60000);
    if (rest === 0 && !notified) {
      notified = true;
      setTimeout(() => alert("試験時間が終了しました。"), 50);
    }
  }
  tick();
  setInterval(tick, 500);

  document.getElementById("timerReset").addEventListener("click", () => {
    if (!confirm(`タイマーを${EXAM_CONFIG.totalMinutes}分にリセットしますか？`)) return;
    start(); notified = false; tick();
  });
}

/* ---------------- マーカー（ツールバー方式） ---------------- */

function initMarker() {
  const mondai = document.querySelector(".mondai");
  const bar = document.querySelector(".mk-toolbar");
  if (!mondai || !bar) return;
  let tool = "pointer";

  bar.querySelectorAll(".mk-tool").forEach(btn => {
    btn.addEventListener("click", () => {
      tool = btn.dataset.tool;
      bar.querySelectorAll(".mk-tool").forEach(b => b.classList.toggle("on", b === btn));
      mondai.className = mondai.className.replace(/\btool-\S+/g, "").trim() + " tool-" + tool;
    });
  });

  const zoom = document.getElementById("zoomRange");
  zoom.addEventListener("input", () => {
    mondai.style.fontSize = zoom.value + "%";
    document.getElementById("zoomVal").textContent = zoom.value + " %";
  });

  function textNodesIn(range) {
    const root = range.commonAncestorContainer;
    const container = root.nodeType === 3 ? root.parentNode : root;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) if (range.intersectsNode(n)) nodes.push(n);
    return nodes;
  }
  function unwrap(mark) {
    const p = mark.parentNode;
    while (mark.firstChild) p.insertBefore(mark.firstChild, mark);
    p.removeChild(mark);
    p.normalize();
  }
  function highlight(range, cls) {
    textNodesIn(range).forEach(node => {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.data.length;
      if (start >= end) return;
      // 既存マーカー内なら一旦外して色を上書き
      if (node.parentNode.tagName === "MARK") {
        const m = node.parentNode;
        m.className = cls;
        return;
      }
      let t = node;
      if (end < t.data.length) t.splitText(end);
      let mid = t;
      if (start > 0) mid = t.splitText(start);
      if (!mid.data.length) return;
      const mark = document.createElement("mark");
      mark.className = cls;
      mid.parentNode.insertBefore(mark, mid);
      mark.appendChild(mid);
    });
  }

  mondai.addEventListener("pointerup", () => {
    if (!["red", "blue", "yellow"].includes(tool)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!mondai.contains(range.commonAncestorContainer)) return;
    highlight(range.cloneRange(), "mk-" + tool);
    sel.removeAllRanges();
  });

  mondai.addEventListener("click", e => {
    if (tool === "eraser" && e.target.tagName === "MARK") unwrap(e.target);
  });

  document.getElementById("mkClear").addEventListener("click", () => {
    mondai.querySelectorAll("mark").forEach(unwrap);
  });
}

/* ---------------- 解答状況 ---------------- */

function initStatus(ui) {
  const btn = document.getElementById("statusBtn");
  const panel = document.getElementById("statusPanel");
  if (!btn) return;

  function render() {
    let html = "<h3>解答状況一覧</h3>";
    const rows = [];
    let heading = "";
    ui.answers.querySelectorAll("h2.setumon, .qa-item").forEach(el => {
      if (el.tagName === "H2") { heading = el.textContent.trim().split(/\s|　/)[0]; return; }
      const tas = Array.from(el.querySelectorAll("textarea"));
      const filled = tas.filter(t => t.value.trim()).length;
      const done = tas.length > 0 && filled === tas.length;
      const q = (el.querySelector(".q-text") || {}).textContent || "";
      const short = q.replace(/配点.*$/, "").trim().slice(0, 28);
      rows.push({ el, done, label: heading + " " + short, part: filled > 0 && !done });
    });
    panel.innerHTML = html;
    rows.forEach(r => {
      const row = h("div", "status-row" + (r.done ? " done" : ""));
      row.innerHTML = `<span class="st">${r.done ? "済" : r.part ? "一部" : "未"}</span><span class="tx"></span>`;
      row.querySelector(".tx").textContent = r.label;
      row.addEventListener("click", () => {
        r.el.scrollIntoView({ block: "start", behavior: "smooth" });
        r.el.classList.remove("flash"); void r.el.offsetWidth; r.el.classList.add("flash");
        panel.classList.remove("show");
      });
      panel.appendChild(row);
    });
  }
  btn.addEventListener("click", e => {
    e.stopPropagation();
    if (!panel.classList.contains("show")) render();
    panel.classList.toggle("show");
  });
  document.addEventListener("click", e => {
    if (!panel.contains(e.target)) panel.classList.remove("show");
  });
}

/* ---------------- 確認終了（=採点） ---------------- */

function initFinish(ui) {
  const btn = document.getElementById("finishBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!confirm("解答を確認して採点します。よろしいですか？")) return;
    const g = document.getElementById("gradeBtn");
    if (g) g.click();
    const s = document.getElementById("scoreSummary");
    if (s) s.scrollIntoView({ block: "end", behavior: "smooth" });
  });
}

/* ---------------- メモ ---------------- */

function initMemo() {
  const MAX = EXAM_CONFIG.memoMaxChars;
  const K = EXAM_CONFIG.storage.memo;
  const win = h("div", "memo-win");
  win.innerHTML = `
    <div class="memo-bar">
      <label><input type="checkbox" id="memoTrans"> 半透明</label>
      <span class="grow"></span>
      <button type="button" class="x" id="memoX" title="閉じる">×</button>
    </div>
    <div class="memo-tools">
      <button type="button" class="tb" id="mSearch">🔍 検索</button>
      <button type="button" class="sw" data-c="#d32f2f" style="background:#d32f2f" title="赤"></button>
      <button type="button" class="sw" data-c="#1d3fd1" style="background:#1d3fd1" title="青"></button>
      <button type="button" class="sw" data-c="#e08a00" style="background:#e08a00" title="橙"></button>
      <button type="button" class="sw none" data-c="" title="色を戻す"></button>
      <span class="sep"></span>
      <button type="button" class="tb" id="mCut">✂ カット</button>
      <button type="button" class="tb" id="mCopy">⧉ コピー</button>
      <button type="button" class="tb" id="mPaste">📋 ペースト</button>
    </div>
    <div class="memo-search" id="mSearchBar">
      <span>🔍</span>
      <input type="text" id="mQuery" placeholder="検索">
      <span class="cnt" id="mCnt">0/0</span>
      <button type="button" id="mPrev" title="前へ">▲</button>
      <button type="button" id="mNext" title="次へ">▼</button>
      <button type="button" id="mQClear" title="クリア">×</button>
    </div>
    <div class="memo-body" id="memoBody" contenteditable="true" spellcheck="false"></div>
    <div class="memo-foot">
      <button type="button" class="btn navy" id="memoClose" style="min-width:140px">閉じる</button>
      <span class="count" id="memoCount">0 / ${MAX.toLocaleString()} 文字</span>
    </div>
    <div class="memo-toast" id="memoToast"></div>`;
  document.body.appendChild(win);

  const body = win.querySelector("#memoBody");
  const $ = id => win.querySelector("#" + id);
  const saved = lsGet(K);
  if (saved) body.innerHTML = saved;          // 自分で保存したHTML（貼り付けはプレーンテキストのみ）

  const textLen = () => body.textContent.length;
  let lastGood = body.innerHTML;
  function toast(msg) {
    const t = $("memoToast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  function updateCount() {
    const n = textLen();
    $("memoCount").textContent = `${n.toLocaleString()} / ${MAX.toLocaleString()} 文字`;
    $("memoCount").classList.toggle("over", n >= MAX);
  }
  body.addEventListener("input", () => {
    if (textLen() > MAX) {               // 上限超過は直前の状態へ戻す
      body.innerHTML = lastGood;
      toast(`${MAX.toLocaleString()}文字までです`);
      const r = document.createRange(); r.selectNodeContents(body); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    } else {
      lastGood = body.innerHTML;
      lsSet(K, lastGood);
    }
    updateCount();
    if ($("mSearchBar").classList.contains("show")) runSearch(false);
  });
  // 書式付き貼り付け・ドロップはプレーンテキスト化
  body.addEventListener("paste", e => {
    e.preventDefault();
    insertPlain((e.clipboardData || window.clipboardData).getData("text/plain"));
  });
  body.addEventListener("drop", e => e.preventDefault());
  function insertPlain(text) {
    const room = MAX - textLen() + (getSelection().toString().length || 0);
    if (text.length > room) { text = text.slice(0, Math.max(0, room)); toast(`${MAX.toLocaleString()}文字までです`); }
    body.focus();
    document.execCommand("insertText", false, text);
  }
  updateCount();

  // ツールバー：フォーカス（選択範囲）を奪わない
  win.querySelectorAll(".memo-tools button").forEach(b => b.addEventListener("mousedown", e => e.preventDefault()));
  win.querySelectorAll(".sw").forEach(b => b.addEventListener("click", () => {
    body.focus();
    document.execCommand("styleWithCSS", false, true);
    if (b.dataset.c) document.execCommand("foreColor", false, b.dataset.c);
    else document.execCommand("removeFormat");
    body.dispatchEvent(new Event("input"));
  }));
  $("mCut").addEventListener("click", () => { body.focus(); document.execCommand("cut"); body.dispatchEvent(new Event("input")); });
  $("mCopy").addEventListener("click", () => { body.focus(); document.execCommand("copy"); });
  $("mPaste").addEventListener("click", async () => {
    try { insertPlain(await navigator.clipboard.readText()); }
    catch (e) { body.focus(); toast("ブラウザの制限により Ctrl+V で貼り付けてください"); }
  });

  /* ---- 検索（CSS Custom Highlight API。本文を書き換えない） ---- */
  let hits = [], cur = -1;
  const HL = window.CSS && CSS.highlights && window.Highlight;
  function paint() {
    if (HL) {
      CSS.highlights.set("memo-hit", new Highlight(...hits));
      if (cur >= 0) CSS.highlights.set("memo-cur", new Highlight(hits[cur])); else CSS.highlights.delete("memo-cur");
    }
    $("mCnt").textContent = hits.length ? `${cur + 1}/${hits.length}` : "0/0";
    if (cur >= 0) {
      const el = hits[cur].startContainer.parentElement;
      el && el.scrollIntoView({ block: "nearest" });
      if (!HL) { const s = getSelection(); s.removeAllRanges(); s.addRange(hits[cur]); }
    }
  }
  function runSearch(reset = true) {
    const q = $("mQuery").value.toLowerCase();
    hits = [];
    if (q) {
      const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const t = n.data.toLowerCase();
        for (let i = t.indexOf(q); i >= 0; i = t.indexOf(q, i + q.length)) {
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + q.length); hits.push(r);
        }
      }
    }
    cur = hits.length ? (reset ? 0 : Math.min(Math.max(cur, 0), hits.length - 1)) : -1;
    paint();
  }
  const step = d => { if (hits.length) { cur = (cur + d + hits.length) % hits.length; paint(); } };
  $("mSearch").addEventListener("click", () => {
    const bar = $("mSearchBar");
    bar.classList.toggle("show");
    $("mSearch").classList.toggle("on", bar.classList.contains("show"));
    if (bar.classList.contains("show")) { $("mQuery").focus(); runSearch(); }
    else { $("mQuery").value = ""; runSearch(); }
  });
  $("mQuery").addEventListener("input", () => runSearch());
  $("mQuery").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); } });
  $("mNext").addEventListener("click", () => step(1));
  $("mPrev").addEventListener("click", () => step(-1));
  $("mQClear").addEventListener("click", () => { $("mQuery").value = ""; runSearch(); $("mQuery").focus(); });

  /* ---- 開閉・半透明・ドラッグ移動 ---- */
  const open = () => { win.classList.add("show"); body.focus(); };
  const close = () => win.classList.remove("show");
  document.getElementById("memoBtn").addEventListener("click", () => win.classList.contains("show") ? close() : open());
  $("memoX").addEventListener("click", close);
  $("memoClose").addEventListener("click", close);
  $("memoTrans").addEventListener("change", e => win.classList.toggle("trans", e.target.checked));

  const bar = win.querySelector(".memo-bar");
  bar.addEventListener("pointerdown", e => {
    if (e.target.closest("label,button")) return;
    const r = win.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    bar.setPointerCapture(e.pointerId);
    const move = ev => {
      win.style.left = Math.min(Math.max(0, ev.clientX - dx), innerWidth - 80) + "px";
      win.style.top = Math.min(Math.max(0, ev.clientY - dy), innerHeight - 40) + "px";
    };
    const up = () => { bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  });
}

/* ---------------- 起動 ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  const ui = initLayout();     // 問題ページのみ 2ペインに組み替え
  initCharCounters();
  initGrading();
  if (!ui) return;
  initInvert();
  initTimer();
  initMarker();
  initStatus(ui);
  initFinish(ui);
  initMemo();
});
