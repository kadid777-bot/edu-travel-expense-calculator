// 규정 본문(data/regulations/*.txt)을 "조항 단위 조각"으로 나눠 data/regulation-chunks.json으로 저장한다.
// 실행: node scripts/build-regulation-chunks.mjs   (규정 텍스트가 바뀔 때만 다시 실행)
// - 본문은 "제N조(제목)"마다 한 조각, 부칙은 제외, 별표는 약 1,800자씩 줄 단위로 나눈다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = [
  { document: "여비세칙", file: "data/regulations/여비세칙.txt" },
  { document: "인력개발세칙", file: "data/regulations/인력개발세칙.txt" },
];
const MAX_APPENDIX = 1800;

function clean(lines) {
  return lines.map((l) => l.replace(/\s+$/g, "")).filter((l) => l.trim() !== "").join("\n");
}

function splitBySize(text, max) {
  const out = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur && cur.length + line.length + 1 > max) {
      out.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line;
  }
  if (cur) out.push(cur);
  return out;
}

const chunks = [];
for (const { document, file } of SOURCES) {
  const lines = fs.readFileSync(path.join(root, file), "utf8").split(/\r?\n/);
  let state = "body"; // body → (부칙: 건너뜀) → appendix
  let cur = null; // { article, title, lines }
  let appendixNo = null;

  const flush = () => {
    if (!cur) return;
    const text = clean(cur.lines);
    if (!text) { cur = null; return; }
    if (cur.kind === "article") {
      chunks.push({ document, article: cur.article, title: cur.title, text });
    } else {
      const parts = splitBySize(text, MAX_APPENDIX);
      parts.forEach((p, i) =>
        chunks.push({ document, article: cur.article, title: parts.length > 1 ? `${cur.title} (${i + 1}/${parts.length})` : cur.title, text: p }),
      );
    }
    cur = null;
  };

  for (const line of lines) {
    if (/^\s*부\s*칙/.test(line)) { flush(); state = "skip"; continue; }
    const appendix = line.match(/^\[별표\s*(\d+(?:의\d+)?)\]/);
    if (appendix) {
      flush();
      state = "appendix";
      appendixNo = appendix[1];
      cur = { kind: "appendix", article: `별표 ${appendixNo}`, title: `별표 ${appendixNo}`, lines: [line] };
      continue;
    }
    if (state === "skip") continue;
    if (state === "body") {
      const art = line.match(/^제(\d+)조(?:의(\d+))?\(([^)]*)\)/);
      if (art) {
        flush();
        const article = `제${art[1]}조${art[2] ? `의${art[2]}` : ""}`;
        cur = { kind: "article", article, title: art[3], lines: [line] };
        continue;
      }
      // 장(章) 제목은 조각에 넣지 않는다
      if (/^제\d+장\s/.test(line) || /^제\d+절\s/.test(line)) continue;
    }
    if (cur) cur.lines.push(line);
  }
  flush();
}

// 한글 파일의 표는 글자를 뽑으면 열이 흩어져 AI가 금액을 잘못 읽는다(예: 일비 27,000원을 식비로).
// 그래서 가장 많이 묻는 표(별표 1)는 사람이 다시 정리한 조각을 함께 넣는다. 금액·등급은 원문 표와 같다.
chunks.push({
  document: "여비세칙",
  article: "별표 1",
  title: "별표 1 표 정리: 직원·임원 교통비 일비 숙박비 식비 금액",
  text: [
    "[표 정리] 여비세칙 별표 1 제1호 시외 출장여비 (단위: 원). 원문 표의 열이 흩어져 있어 다시 정리한 내용이다.",
    "■ 직원 기준",
    "- 교통비: 철도운임은 실비(고속철도 일반실), 항공운임은 실비(일반석), 선박운임은 실비(2등급), 자동차운임은 실비",
    "- 일비(1일당): 27,000원",
    "- 숙박비(1박당): 실비이며 상한액은 서울 100,000원, 기타 지역 80,000원",
    "- 식비(1일당): 36,000원",
    "■ 임원 기준",
    "- 교통비: 철도운임은 실비(고속철도특실), 항공운임은 실비, 선박운임은 실비(1등급), 자동차운임은 실비",
    "- 일비(1일당): 30,000원",
    "- 숙박비: 실비",
  ].join("\n"),
});

const outFile = path.join(root, "data/regulation-chunks.json");
fs.writeFileSync(outFile, JSON.stringify(chunks, null, 1), "utf8");
const byDoc = {};
for (const c of chunks) byDoc[c.document] = (byDoc[c.document] ?? 0) + 1;
console.log("조각 수:", chunks.length, byDoc, "최대 길이:", Math.max(...chunks.map((c) => c.text.length)));
