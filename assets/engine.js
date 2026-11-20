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

      let resultBox = item.querySelector(".result-box");
      if (!resultBox) { resultBox = document.createElement("div"); item.appendChild(resultBox); }
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

/* ---------------- 試験画面（CBT風レイアウト） ---------------- */

const TIME_LIMIT_MIN = 75;   // 1問あたりの制限時間（分）。必要なら変更
const ICON_LIST = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M3 5h3v3H3zm5 0h13v3H8zM3 10.5h3v3H3zm5 0h13v3H8zM3 16h3v3H3zm5 0h13v3H8z"/></svg>';
const ICON_MARK = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M6 2h12a1 1 0 011 1v19l-7-4-7 4V3a1 1 0 011-1z"/></svg>';
const ICON_PREV = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.4" d="M20 12H5m6-7-7 7 7 7"/></svg>';
const ICON_NEXT = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.4" d="M4 12h15m-6-7 7 7-7 7"/></svg>';
const ICON_EXIT = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" d="M9 4H4v16h5M14 8l4 4-4 4M8 12h10"/></svg>';

const EXAM = {};
const MK_HTML = id => `<div class="ex-mk" id="${id}">
            <button data-mode="none" class="act" title="通常モード">↖</button>
            <button data-mode="mk-red" class="c-red" title="赤マーカー"></button>
            <button data-mode="mk-blue" class="c-blue" title="青マーカー"></button>
            <button data-mode="mk-yellow" class="c-yellow" title="黄マーカー"></button>
            <button data-mode="erase" title="消しゴム">⌫</button>
            <button data-mode="clear" class="wide">クリア</button>
          </div>`;

function buildExamShell() {
  const wrap = document.querySelector(".wrap");
  if (!wrap || !wrap.querySelector(".mondai") || !wrap.querySelector(".qa-item")) return false;

  const h1 = wrap.querySelector("h1");
  const note = wrap.querySelector(".note");
  const gradeBtn = document.getElementById("gradeBtn");
  const summary = document.getElementById("scoreSummary");
  const back = wrap.querySelector("a.backlink");
  const firstMeta = wrap.querySelector(".meta");
  const skip = new Set([h1, note, gradeBtn, summary, back, firstMeta]);

  document.body.classList.add("exam");

  const left = document.createElement("div"); left.className = "ex-lcontent";
  const right = document.createElement("div"); right.className = "ex-right";
  let inRight = false;
  Array.from(wrap.children).forEach(el => {
    if (skip.has(el)) return;
    if (el.classList.contains("setumon")) inRight = true;
    (inRight ? right : left).appendChild(el);
  });
  if (gradeBtn) right.appendChild(gradeBtn);
  if (summary) right.appendChild(summary);

  const root = document.createElement("div");
  root.style.display = "contents";
  root.innerHTML = `
    <div class="ex-header">
      <div class="ex-top"><span>情報処理安全確保支援士 午後問題演習</span><a href="index.html">← 問題一覧</a><a href="../index.html">年度一覧</a></div>
      <div class="ex-sub">
        <div class="ex-page">${h1 ? h1.textContent.trim() : ""}</div>
        <div class="ex-tools">
          <span id="exScore"></span>
          <label class="ex-switch">白黒反転<i></i><input type="checkbox" id="exDark" hidden></label>
          <button class="ex-btn navy" id="exMemo">メモ</button>
          <button class="ex-btn blue" id="exRef">参考資料</button>
          <button class="ex-btn pink" id="exFinish">${ICON_EXIT}確認終了</button>
          <span class="ex-timer">残り時間<b id="exTimer">--:--</b></span>
        </div>
      </div>
    </div>
    <div class="ex-main">
      <div class="ex-left">
        <div class="ex-zoom">
          <div class="zbox">拡大・縮小 <span id="exZoomVal">100</span>%<input type="range" id="exZoom" min="60" max="200" step="10" value="100"></div>
          ${MK_HTML("exMk")}
        </div>
        <div class="ex-lscroll" id="exLScroll"></div>
      </div>
      <div class="ex-split" id="exSplit" title="ドラッグで表示割合を変更"></div>
    </div>
    <div class="ex-bottom">
      <button class="ex-btn blue" id="exStatus">${ICON_LIST}解答状況</button>
      <button class="ex-btn blue" id="exCalcBtn">電卓</button>
      <button class="ex-btn green" id="exPop">問題（別画面）</button>
      <span class="sp"></span>
      <button class="ex-btn blue" id="exReview">${ICON_MARK}後で見直す</button>
      <button class="ex-btn teal" id="exPrev">${ICON_PREV}前の問題</button>
      <button class="ex-btn teal" id="exNext">${ICON_NEXT}次の問題</button>
    </div>`;
  document.body.appendChild(root);
  root.querySelector("#exLScroll").appendChild(left);
  root.querySelector(".ex-main").appendChild(right);

  EXAM.root = root; EXAM.left = left; EXAM.right = right;
  EXAM.lscroll = root.querySelector("#exLScroll");
  EXAM.noteHtml = note ? note.innerHTML : "";
  EXAM.gradeBtn = gradeBtn; EXAM.summary = summary;
  wrap.remove();
  return true;
}

function showModal(title, html) {
  const ov = document.createElement("div");
  ov.className = "ex-ov";
  ov.innerHTML = `<div class="ex-modal"><button class="close">閉じる</button><h3>${title}</h3>${html}</div>`;
  ov.addEventListener("click", e => { if (e.target === ov || e.target.classList.contains("close")) ov.remove(); });
  document.body.appendChild(ov);
  return ov;
}

function initExamControls() {
  if (!EXAM.root) return;
  const $ = id => document.getElementById(id);
  const right = EXAM.right;
  const items = Array.from(right.querySelectorAll(".qa-item"));

  // 各解答欄のラベル（設問N (k)）
  let curSet = "", k = 0;
  const labels = new Map();
  Array.from(right.children).forEach(el => {
    if (el.classList.contains("setumon")) { curSet = (el.textContent.match(/設問\s*\d+/) || [""])[0]; k = 0; }
    else if (el.classList.contains("qa-item")) {
      k++;
      const m = (el.querySelector(".q-text") || {}).textContent;
      const sub = m && m.match(/^\s*(\(\d+\))/);
      labels.set(el, curSet + " " + (sub ? sub[1] : "(" + k + ")"));
    }
  });
  const statusOf = it => {
    const tas = Array.from(it.querySelectorAll("textarea"));
    const f = tas.filter(t => t.value.trim()).length;
    return f === 0 ? "none" : f === tas.length ? "ok" : "part";
  };

  // 現在の解答欄
  let cur = 0;
  const setCur = i => {
    cur = i;
    items.forEach((it, n) => it.classList.toggle("cur", n === i));
    $("exPrev").disabled = i <= 0;
    $("exNext").disabled = i >= items.length - 1;
    $("exReview").classList.toggle("on", items[i].classList.contains("review"));
  };
  const goTo = i => {
    i = Math.max(0, Math.min(items.length - 1, i));
    right.scrollTo({ top: items[i].offsetTop - 6, behavior: "smooth" });
    setCur(i);
    const ta = items[i].querySelector("textarea"); if (ta) ta.focus({ preventScroll: true });
  };
  right.addEventListener("scroll", () => {
    let idx = 0;
    items.forEach((it, n) => { if (it.offsetTop - right.scrollTop <= 40) idx = n; });
    if (right.scrollTop + right.clientHeight >= right.scrollHeight - 2) idx = items.length - 1;
    if (idx !== cur) setCur(idx);
  });
  items.forEach((it, n) => it.addEventListener("focusin", () => { if (cur !== n) setCur(n); }));
  $("exPrev").onclick = () => goTo(cur - 1);
  $("exNext").onclick = () => goTo(cur + 1);
  $("exReview").onclick = () => { items[cur].classList.toggle("review"); setCur(cur); };
  setCur(0);

  // 解答状況
  $("exStatus").onclick = () => {
    const chip = it => {
      const s = statusOf(it);
      return (s === "ok" ? '<span class="chip ok">回答済</span>' : s === "part" ? '<span class="chip part">一部回答</span>' : '<span class="chip">未回答</span>')
        + (it.classList.contains("review") ? ' <span class="chip rv">後で見直す</span>' : "");
    };
    const ov = showModal("解答状況",
      `<table class="st-tbl">${items.map((it, n) => `<tr data-i="${n}"><td>${labels.get(it)}</td><td>${chip(it)}</td></tr>`).join("")}</table>`);
    ov.querySelectorAll("tr").forEach(tr => tr.onclick = () => { ov.remove(); goTo(+tr.dataset.i); });
  };

  // 参考資料
  $("exRef").onclick = () => showModal("参考資料", `<div style="font-size:.9em">${EXAM.noteHtml}
    <p>・左画面の問題文は、拡大・縮小スライダーやマーカーで操作できます。<br>・中央の境界線をドラッグすると、左右の表示割合を変更できます。<br>・「確認終了」で採点します。</p></div>`);

  // 白黒反転
  const dark = $("exDark");
  dark.parentElement.addEventListener("click", e => { e.preventDefault(); dark.checked = !dark.checked; document.body.classList.toggle("dark", dark.checked); });

  // 拡大・縮小
  $("exZoom").addEventListener("input", e => {
    $("exZoomVal").textContent = e.target.value;
    EXAM.left.style.zoom = e.target.value / 100;
  });

  // 左右の境界ドラッグ
  const split = $("exSplit"), leftPane = EXAM.root.querySelector(".ex-left"), main = EXAM.root.querySelector(".ex-main");
  split.addEventListener("pointerdown", e => {
    split.setPointerCapture(e.pointerId);
    const mv = ev => {
      const r = main.getBoundingClientRect();
      leftPane.style.flexBasis = Math.max(25, Math.min(80, (ev.clientX - r.left) / r.width * 100)) + "%";
    };
    const up = () => { split.removeEventListener("pointermove", mv); split.removeEventListener("pointerup", up); };
    split.addEventListener("pointermove", mv); split.addEventListener("pointerup", up);
  });

  // タイマー・確認終了
  let graded = false;
  const key = "siensi_start_" + location.pathname;
  let start = Date.now();
  try { start = +sessionStorage.getItem(key) || start; sessionStorage.setItem(key, start); } catch (e) {}
  const finish = () => {
    if (graded || !EXAM.gradeBtn) return;
    EXAM.gradeBtn.click(); graded = true;
    if (EXAM.summary) $("exScore").textContent = "得点 " + EXAM.summary.textContent.replace("合計得点：", "");
    right.scrollTo({ top: 0, behavior: "smooth" });
  };
  const tick = () => {
    const rem = Math.max(0, TIME_LIMIT_MIN * 60 - Math.floor((Date.now() - start) / 1000));
    $("exTimer").textContent = String(Math.floor(rem / 60)).padStart(2, "0") + ":" + String(rem % 60).padStart(2, "0");
    if (rem === 0 && !graded) { clearInterval(timer); finish(); }
  };
  const timer = setInterval(() => { if (!graded) tick(); }, 1000);
  tick();
  $("exFinish").onclick = () => {
    if (graded) { EXAM.gradeBtn.click(); return; }   // 再採点
    if (confirm("確認終了して採点します。よろしいですか？")) finish();
  };

  // 電卓
  const calc = document.createElement("div");
  calc.className = "calc"; calc.hidden = true;
  const keys = ["±","AC","BS","÷","7","8","9","×","4","5","6","−","1","2","3","+","0","00",".","="];
  calc.innerHTML = `<div class="calc-head"><span>電卓</span><span><button data-z="0.85">小</button><button data-z="1">中</button><button data-z="1.3">大</button></span></div>
    <div class="calc-disp">0</div><div class="calc-keys">${keys.map(k => `<button>${k}</button>`).join("")}</div>`;
  document.body.appendChild(calc);
  const disp = calc.querySelector(".calc-disp");
  let c = { cur: "0", acc: null, op: null, fresh: true };
  const fmt = v => String(parseFloat(Number(v).toPrecision(12)));
  const apply = (a, op, b) => op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : (b === 0 ? NaN : a / b);
  const show = () => { disp.textContent = c.cur === "NaN" ? "エラー" : c.cur; };
  calc.querySelector(".calc-keys").addEventListener("click", e => {
    const t = e.target.textContent; if (e.target.tagName !== "BUTTON") return;
    if (/^\d+$/.test(t)) { c.cur = c.fresh || c.cur === "0" ? (t === "00" ? "0" : t) : c.cur + t; c.fresh = false; }
    else if (t === ".") { if (c.fresh) { c.cur = "0."; c.fresh = false; } else if (!c.cur.includes(".")) c.cur += "."; }
    else if (t === "AC") c = { cur: "0", acc: null, op: null, fresh: true };
    else if (t === "BS") { c.cur = c.cur.length > 1 ? c.cur.slice(0, -1) : "0"; }
    else if (t === "±") { c.cur = c.cur.startsWith("-") ? c.cur.slice(1) : (c.cur === "0" ? "0" : "-" + c.cur); }
    else if (t === "=") { if (c.op !== null) { c.cur = fmt(apply(c.acc, c.op, parseFloat(c.cur))); c.op = null; c.acc = null; } c.fresh = true; }
    else { // 演算子
      if (c.op !== null && !c.fresh) c.cur = fmt(apply(c.acc, c.op, parseFloat(c.cur)));
      c.acc = parseFloat(c.cur); c.op = t; c.fresh = true;
    }
    show();
  });
  calc.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { calc.style.zoom = b.dataset.z; });
  $("exCalcBtn").onclick = () => { calc.hidden = !calc.hidden; $("exCalcBtn").classList.toggle("on", !calc.hidden); };
  const head = calc.querySelector(".calc-head");
  head.addEventListener("pointerdown", e => {
    if (e.target.tagName === "BUTTON") return;
    const r = calc.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const mv = ev => { calc.style.left = ev.clientX - dx + "px"; calc.style.top = ev.clientY - dy + "px"; calc.style.right = "auto"; };
    const up = () => { head.removeEventListener("pointermove", mv); head.removeEventListener("pointerup", up); };
    head.addEventListener("pointermove", mv); head.addEventListener("pointerup", up);
  });
}

/* ---------------- マーカー機能（本画面・別ウィンドウ共通） ---------------- */

function attachMarker({ doc, target, scroller, toolbar }) {
  const win = doc.defaultView;
  let mode = "none";

  function getIntersectingTextNodes(range) {
    const root = range.commonAncestorContainer;
    const container = root.nodeType === 3 ? root.parentNode : root;
    const walker = doc.createTreeWalker(container, 4 /* SHOW_TEXT */);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) if (range.intersectsNode(node)) nodes.push(node);
    return nodes;
  }
  function wrapPortion(textNode, start, end, colorClass) {
    let node = textNode;
    if (end < node.data.length) node.splitText(end);
    let middle = node;
    if (start > 0) middle = node.splitText(start);
    if (middle.data.length === 0) return;
    const mark = doc.createElement("mark");
    mark.className = colorClass;
    middle.parentNode.insertBefore(mark, middle);
    mark.appendChild(middle);
  }
  function highlight(range, colorClass) {
    getIntersectingTextNodes(range).forEach(node => {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.data.length;
      if (start < end) wrapPortion(node, start, end, colorClass);
    });
  }
  function unwrap(mark) {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
  function setMode(m) {
    mode = m;
    scroller.classList.toggle("mk-on", m.startsWith("mk-"));
    scroller.classList.toggle("mk-erase", m === "erase");
    toolbar.querySelectorAll("button").forEach(b => b.classList.toggle("act", b.dataset.mode === m));
  }
  toolbar.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.mode === "clear") { target.querySelectorAll("mark").forEach(unwrap); setMode("none"); }
    else setMode(b.dataset.mode);
  }));
  target.addEventListener("mouseup", () => {
    if (!mode.startsWith("mk-")) return;
    const sel = win.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!target.contains(range.commonAncestorContainer)) return;
    highlight(range, mode);
    sel.removeAllRanges();
  });
  target.addEventListener("click", e => {
    if (mode === "erase" && e.target.tagName === "MARK") unwrap(e.target);
  });
}

function initMarker() {
  if (!EXAM.left) return;
  attachMarker({ doc: document, target: EXAM.left, scroller: EXAM.lscroll, toolbar: document.getElementById("exMk") });
}

/* ---------------- 問題（別画面）：別ウィンドウに問題文を表示 ---------------- */

function initPopup() {
  const btn = document.getElementById("exPop");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (EXAM.popup && !EXAM.popup.closed) { EXAM.popup.focus(); return; }
    const w = window.open("", "siensi_mondai", "width=780,height=900,resizable=yes,scrollbars=yes");
    if (!w) { alert("ポップアップがブロックされました。ブラウザのアドレスバーでこのサイトのポップアップを許可してください。"); return; }
    EXAM.popup = w;
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => `<link rel="stylesheet" href="${l.href}">`).join("");
    const d = w.document;
    d.open();
    d.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>問題（別画面）</title>${links}</head>
      <body class="exam popup${document.body.classList.contains("dark") ? " dark" : ""}">
        <div class="pp-bar"><b>問題（別画面）</b><span><button id="ppL">大</button><button id="ppS">標準</button></span></div>
        <div class="ex-zoom">
          <div class="zbox">拡大・縮小 <span id="ppZV">100</span>%<input type="range" id="ppZ" min="60" max="200" step="10" value="100"></div>
          ${MK_HTML("ppMk")}
        </div>
        <div class="ex-lscroll" id="ppScroll"><div id="ppContent"></div></div>
        <div class="pp-foot"><button class="ex-btn green" id="ppClose">閉じる</button></div>
      </body></html>`);
    d.close();
    const content = d.getElementById("ppContent");
    content.innerHTML = EXAM.left.innerHTML;          // 現在のマーカーも引き継ぐ
    content.style.zoom = 1;
    d.getElementById("ppZ").addEventListener("input", e => {
      d.getElementById("ppZV").textContent = e.target.value;
      content.style.zoom = e.target.value / 100;
    });
    d.getElementById("ppL").onclick = () => { content.style.fontSize = "1.35em"; };
    d.getElementById("ppS").onclick = () => { content.style.fontSize = ""; };
    d.getElementById("ppClose").onclick = () => w.close();
    attachMarker({ doc: d, target: content, scroller: d.getElementById("ppScroll"), toolbar: d.getElementById("ppMk") });
    window.addEventListener("beforeunload", () => { if (!w.closed) w.close(); });
  });
}

/* ---------------- メモ機能 ---------------- */

function initMemo() {
  const btn = document.getElementById("exMemo");
  if (!btn) return;
  const key = "siensi_memo_" + location.pathname;
  const m = document.createElement("div");
  m.className = "memo"; m.hidden = true;
  m.innerHTML = `
    <div class="memo-head"><label><input type="checkbox" id="memoTr"> 半透明</label><span>メモ</span><button class="memo-x" title="閉じる">×</button></div>
    <div class="memo-bar">
      <button data-a="find">🔍 検索</button><button data-a="cut">✂ カット</button><button data-a="copy">⧉ コピー</button><button data-a="paste">📋 ペースト</button>
      <span class="memo-colors"><i data-c="#d32f2f" style="background:#d32f2f"></i><i data-c="#1e40ff" style="background:#1e40ff"></i><i data-c="#ef6c00" style="background:#ef6c00"></i><i data-c="#222" style="background:#222"></i></span>
    </div>
    <div class="memo-find" hidden><input type="text" placeholder="検索語"><span class="cnt">0/0</span><button data-a="up">▲</button><button data-a="down">▼</button><button data-a="fx">✖</button></div>
    <div class="memo-body"><div class="memo-mirror"></div><textarea spellcheck="false" placeholder="ここにメモを入力できます"></textarea></div>`;
  document.body.appendChild(m);

  const ta = m.querySelector("textarea"), mirror = m.querySelector(".memo-mirror");
  const findBox = m.querySelector(".memo-find"), q = findBox.querySelector("input"), cnt = findBox.querySelector(".cnt");
  try { ta.value = sessionStorage.getItem(key) || ""; } catch (e) {}
  let hits = [], hi = 0;

  const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function render() {
    const v = ta.value, term = q.value;
    hits = [];
    if (!findBox.hidden && term) {
      const lv = v.toLowerCase(), lt = term.toLowerCase();
      for (let i = lv.indexOf(lt); i >= 0; i = lv.indexOf(lt, i + lt.length)) hits.push(i);
    }
    if (hi >= hits.length) hi = 0;
    let out = "", pos = 0;
    hits.forEach((h, n) => {
      out += esc(v.slice(pos, h)) + `<mark class="${n === hi ? "cur" : ""}">` + esc(v.slice(h, h + term.length)) + "</mark>";
      pos = h + term.length;
    });
    mirror.innerHTML = out + esc(v.slice(pos)) + "\n ";
    cnt.textContent = hits.length ? (hi + 1) + "/" + hits.length : "0/0";
    mirror.scrollTop = ta.scrollTop;
  }
  function jump() {
    render();
    const cur = mirror.querySelector("mark.cur");
    if (cur) { ta.scrollTop = Math.max(0, cur.offsetTop - 40); mirror.scrollTop = ta.scrollTop; }
  }
  ta.addEventListener("input", () => { render(); try { sessionStorage.setItem(key, ta.value); } catch (e) {} });
  ta.addEventListener("scroll", () => { mirror.scrollTop = ta.scrollTop; });
  q.addEventListener("input", () => { hi = 0; jump(); });

  // 直前に使った入力欄（メモ／解答欄）を対象に カット・コピー・ペースト
  EXAM.lastTA = ta;
  document.addEventListener("focusin", e => { if (e.target.tagName === "TEXTAREA") EXAM.lastTA = e.target; });
  const fire = t => t.dispatchEvent(new Event("input", { bubbles: true }));
  function clip(act) {
    const t = EXAM.lastTA || ta;
    const s = t.selectionStart, e = t.selectionEnd;
    if (act === "paste") {
      if (EXAM.clip == null) return;
      t.setRangeText(EXAM.clip, s, e, "end");
      if (t.maxLength > 0 && t.value.length > t.maxLength) t.value = t.value.slice(0, t.maxLength);
      fire(t); t.focus();
    } else if (s !== e) {
      EXAM.clip = t.value.slice(s, e);
      try { if (navigator.clipboard) navigator.clipboard.writeText(EXAM.clip).catch(() => {}); } catch (x) {}
      if (act === "cut") { t.setRangeText("", s, e, "end"); fire(t); }
      t.focus();
    }
  }
  m.addEventListener("mousedown", e => { if (e.target.closest("button,.memo-colors i")) e.preventDefault(); });
  m.addEventListener("click", e => {
    const b = e.target.closest("button[data-a]"), c = e.target.closest(".memo-colors i");
    if (c) { ta.style.color = c.dataset.c; return; }
    if (e.target.classList.contains("memo-x")) { m.hidden = true; btn.classList.remove("on"); return; }
    if (!b) return;
    const a = b.dataset.a;
    if (a === "find") { findBox.hidden = !findBox.hidden; if (!findBox.hidden) q.focus(); render(); }
    else if (a === "fx") { findBox.hidden = true; q.value = ""; render(); }
    else if (a === "up" || a === "down") { if (hits.length) { hi = (hi + (a === "down" ? 1 : hits.length - 1)) % hits.length; jump(); } }
    else clip(a);
  });
  m.querySelector("#memoTr").addEventListener("change", e => m.classList.toggle("tr", e.target.checked));

  btn.addEventListener("click", () => {
    m.hidden = !m.hidden; btn.classList.toggle("on", !m.hidden);
    if (!m.hidden) ta.focus();
  });
  const head = m.querySelector(".memo-head");
  head.addEventListener("pointerdown", e => {
    if (e.target.closest("button,label")) return;
    const r = m.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const mv = ev => { m.style.left = ev.clientX - dx + "px"; m.style.top = ev.clientY - dy + "px"; m.style.right = "auto"; m.style.bottom = "auto"; };
    const up = () => { head.removeEventListener("pointermove", mv); head.removeEventListener("pointerup", up); };
    head.addEventListener("pointermove", mv); head.addEventListener("pointerup", up);
  });
  render();
}

document.addEventListener("DOMContentLoaded", () => {
  buildExamShell();
  initCharCounters();
  initGrading();
  initMarker();
  initExamControls();
  initMemo();
  initPopup();
});
