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

/* ---------------- マーカー機能 ---------------- */

function initMarker() {
  const mondai = document.querySelector(".mondai");
  if (!mondai) return;

  const popup = document.createElement("div");
  popup.className = "markerPopup";
  popup.innerHTML = `
    <button type="button" class="swatch mk-yellow" data-color="mk-yellow" title="黄"></button>
    <button type="button" class="swatch mk-pink" data-color="mk-pink" title="ピンク"></button>
    <button type="button" class="swatch mk-blue" data-color="mk-blue" title="青"></button>
    <button type="button" class="swatch mk-green" data-color="mk-green" title="緑"></button>
  `;
  document.body.appendChild(popup);

  function getIntersectingTextNodes(range) {
    const root = range.commonAncestorContainer;
    const container = root.nodeType === 3 ? root.parentNode : root;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (range.intersectsNode(node)) nodes.push(node);
    }
    return nodes;
  }

  function wrapTextNodePortion(textNode, start, end, colorClass) {
    let node = textNode;
    if (end < node.data.length) node.splitText(end);
    let middle = node;
    if (start > 0) middle = node.splitText(start);
    if (middle.data.length === 0) return;
    const mark = document.createElement("mark");
    mark.className = colorClass;
    mark.title = "クリックでマーカーを消去";
    middle.parentNode.insertBefore(mark, middle);
    mark.appendChild(middle);
  }

  function highlightSelection(range, colorClass) {
    const nodes = getIntersectingTextNodes(range);
    nodes.forEach((node) => {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.data.length;
      if (start >= end) return;
      wrapTextNodePortion(node, start, end, colorClass);
    });
  }

  function hidePopup() {
    popup.classList.remove("show");
    popup.style.display = "none";
  }

  document.addEventListener("mouseup", (e) => {
    if (popup.contains(e.target)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hidePopup(); return; }
    const range = sel.getRangeAt(0);
    if (!mondai.contains(range.commonAncestorContainer)) { hidePopup(); return; }

    const rect = range.getBoundingClientRect();
    popup.style.display = "flex";
    popup.classList.add("show");
    popup.style.left = window.scrollX + rect.left + rect.width / 2 - popup.offsetWidth / 2 + "px";
    popup.style.top = window.scrollY + rect.top - popup.offsetHeight - 8 + "px";
    popup._range = range.cloneRange();
  });

  popup.querySelectorAll(".swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (popup._range) highlightSelection(popup._range, btn.dataset.color);
      window.getSelection().removeAllRanges();
      hidePopup();
    });
  });

  mondai.addEventListener("click", (e) => {
    if (e.target.tagName === "MARK") {
      const mark = e.target;
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
      e.stopPropagation();
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (!popup.contains(e.target)) hidePopup();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initCharCounters();
  initGrading();
  initMarker();
});
