// Plan 작업 25~27 / 성공 기준 SC-1~8 — 실서비스 점검 (실제 TAGO·네이버·오피넷·OpenAI 호출)
// 실행: npm run test:live   (기본 `npm test`에는 포함되지 않는다)
// 결과는 docs/QA-REPORT.md 로 저장한다. 키 값은 어디에도 출력·저장하지 않는다.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { askRegulation, NOT_FOUND_ANSWER } from "../../lib/ai/ask";
import { explainResult, numbersAllowed } from "../../lib/ai/explain";
import { calculateExpense } from "../../lib/calc/calculate";
import type { CalculationInput, CalculationResult } from "../../lib/calc/types";
import { clearMemo } from "../../lib/external/http";
import { getLookups } from "../../lib/external/lookups";
import cases from "../cases.json";
import { referenceCalc } from "../reference-calc";

const ROOT = process.cwd();
type CaseRow = { id: string; tags: string[]; input: CalculationInput };
const caseRows = cases as CaseRow[];

interface CaseReport {
  id: string;
  tags: string;
  ms: number;
  fareOut: number | null;
  fareIn: number | null;
  distOut: number | null;
  gas: number | null;
  app: number;
  ref: number;
  match: boolean;
  warnings: number;
}
const caseReports: CaseReport[] = [];
const aiReports: { kind: string; q: string; found: boolean; refused: boolean; sentences: number; refs: string; ok: boolean; note: string }[] = [];
const sc: Record<string, { pass: boolean; detail: string }> = {};
let sampleResult: CalculationResult | null = null;

const sentences = (t: string) => t.split(/(?<=[.!?。])\s+/).filter(Boolean).length;

afterAll(() => {
  const lines: string[] = [];
  const now = new Date().toISOString().replace("T", " ").slice(0, 16);
  lines.push("# 검증 보고서 (모듈 5)", "", `- 점검 일시: ${now} (UTC)`, "- 방법: `npm run test:live` — 실제 TAGO·네이버 Directions·오피넷·OpenAI를 호출", "- 값 출처: 외부 조회값은 점검 시점의 실제 응답이며, 이 문서에는 키·질문 외 개인정보가 없다", "");
  lines.push("## 성공 기준 결과", "", "| 기준 | 결과 | 내용 |", "|---|:-:|---|");
  for (const [k, v] of Object.entries(sc)) lines.push(`| ${k} | ${v.pass ? "✅" : "❌"} | ${v.detail} |`);
  lines.push("", "## SC-1 채점 사례 20건 (실시간 조회값으로 계산 → 같은 값으로 기준 계산식과 비교)", "");
  lines.push("| 사례 | 특징 | 열차요금 상한(가는/오는) | 거리(가는 편 km) | 유가 | 앱 합계 | 기준 합계 | 일치 | 응답(ms) |", "|---|---|---|---|---|---:|---:|:-:|---:|");
  for (const r of caseReports) {
    lines.push(`| ${r.id} | ${r.tags} | ${r.fareOut ?? "조회 실패"} / ${r.fareIn ?? "조회 실패"} | ${r.distOut ?? "-"} | ${r.gas ?? "-"} | ${r.app.toLocaleString("ko-KR")} | ${r.ref.toLocaleString("ko-KR")} | ${r.match ? "✅" : "❌"} | ${r.ms} |`);
  }
  lines.push("", "## SC-6 규정 질문 10개 (실제 AI)", "", "| 구분 | 질문 | found | 거절 | 문장 수 | 근거 | 판정 | 비고 |", "|---|---|:-:|:-:|:-:|---|:-:|---|");
  for (const a of aiReports) {
    lines.push(`| ${a.kind} | ${a.q} | ${a.found} | ${a.refused} | ${a.sentences} | ${a.refs || "-"} | ${a.ok ? "✅" : "❌"} | ${a.note} |`);
  }
  const failedLegs = caseReports.filter((r) => r.fareOut === null || r.fareIn === null).map((r) => r.id);
  lines.push(
    "",
    "## 점검에서 드러난 문제 (통과했지만 사용 중 부딪힐 수 있는 것)",
    "",
    `- **열차요금 조회 실패가 20건 중 ${failedLegs.length}건**(${failedLegs.join(", ")})에서 있었다. 이 중 제주 항공(case-04·15·16)·시내(case-18)·울릉군(case-20)은 의도된 경우다.`,
    "- **직통 열차가 없는 구간은 요금이 조회되지 않는다** (case-12 광주송정↔대전: TAGO 결과 0건). 이 경우 교통비 인정을 보류하고 운영자 문의를 안내한다.",
    "- **같은 도시 안 이동(case-09 부산 해운대구→남구)은 대표 철도역이 같아 요금이 없다.** 시내 판정은 시·군 단위(구가 달라도 같은 시)로 바꿔서, 같은 시 안 이동은 시내로 처리돼 여비가 지급되지 않는다.",
    "",
  );
  lines.push("", "## 알려진 한계", "", "- 오피넷 오픈 API는 날짜별 가격이 없어 '출장 당일'이 아니라 조회한 날의 전국 평균가를 쓴다.", "- TAGO `adultcharge`는 API 값 그대로이며 실제 승차권 요금과 다를 수 있다.", "- 시·군·구 좌표와 대표 철도역은 실습용으로 정한 근사값이다.", "- SC-2의 '과정 선택부터 결과 표시까지 1분'은 사람이 입력하는 시간이 포함되어 있어 자동으로 재지 못했다(서버 응답 시간만 측정).");
  fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "docs", "QA-REPORT.md"), lines.join("\n") + "\n", "utf8");
});

describe("SC-1·2·3·5: 채점 사례 20건을 실제 외부 조회값으로", () => {
  it("20건 중 19건 이상이 기준 계산식과 일치하고, 서버 응답은 10초 이내", async () => {
    clearMemo();
    for (const c of caseRows) {
      const t0 = Date.now();
      const lk = await getLookups(c.input);
      const result = calculateExpense(c.input, lk.lookups);
      const ms = Date.now() - t0;
      const ref = referenceCalc(c.input, lk.lookups);
      const [out, inn, lodging, daily, meal] = result.items;
      const match =
        out.approved === (ref.transportOutbound ?? 0) &&
        inn.approved === (ref.transportInbound ?? 0) &&
        lodging.approved === ref.lodging &&
        daily.approved === ref.daily &&
        meal.approved === ref.meal &&
        result.total === ref.total &&
        result.warnings.length > 0 === ref.held.length > 0;
      expect(lk.mock).toBe(false); // 가짜 값이 아닌 실제 조회여야 한다
      caseReports.push({
        id: c.id,
        tags: c.tags.join(" / "),
        ms,
        fareOut: lk.lookups.outbound.fare,
        fareIn: lk.lookups.inbound.fare,
        distOut: lk.lookups.outbound.distanceKm ?? null,
        gas: lk.lookups.outbound.gasolinePrice ?? lk.lookups.inbound.gasolinePrice ?? null,
        app: result.total,
        ref: ref.total,
        match,
        warnings: result.warnings.length,
      });
      // SC-3: 모든 항목에 근거 조항
      for (const item of result.items) expect(item.refs.length, `${c.id} ${item.category}`).toBeGreaterThanOrEqual(1);
      if (c.id === "case-01") sampleResult = result;
    }
    const matched = caseReports.filter((r) => r.match).length;
    const maxMs = Math.max(...caseReports.map((r) => r.ms));
    sc["SC-1 정답률 95% (19/20)"] = { pass: matched >= 19, detail: `${matched}/20건 일치` };
    sc["SC-2 서버 응답 10초 이내"] = { pass: maxMs <= 10_000, detail: `가장 느린 사례 ${maxMs}ms, 평균 ${Math.round(caseReports.reduce((s, r) => s + r.ms, 0) / caseReports.length)}ms` };
    sc["SC-3 모든 항목에 근거 조항"] = { pass: true, detail: "20건 × 5개 항목 모두 1개 이상" };
    expect(matched).toBeGreaterThanOrEqual(19);
    expect(maxMs).toBeLessThanOrEqual(10_000);
  });

  it("SC-5: 조회 실패 시 금액을 지어내지 않고 보류 + 경고 (키를 비워 실패 상황을 만든다)", async () => {
    const saved = { train: process.env.DATA_GO_KR_TRAIN_KEY, naver: process.env.NAVER_MAPS_DIRECTIONS_ID, opinet: process.env.OPINET_API_KEY };
    try {
      process.env.DATA_GO_KR_TRAIN_KEY = "";
      process.env.NAVER_MAPS_DIRECTIONS_ID = "";
      process.env.OPINET_API_KEY = "";
      clearMemo();
      const input = caseRows.find((c) => c.id === "case-01")!.input;
      const lk = await getLookups(input);
      const result = calculateExpense(input, lk.lookups);
      expect(result.items[0].approved).toBe(0);
      expect(result.items[1].approved).toBe(0);
      expect(result.warnings.join(" ")).toContain("요금을 조회하지 못했습니다");
      expect(result.items[2].approved).toBeGreaterThan(0); // 숙박비는 계속 계산
      expect(result.items[4].approved).toBeGreaterThan(0); // 식비도 계속 계산 (case-01은 식비 청구 일수 3일)
      sc["SC-5 조회 실패 처리"] = { pass: true, detail: "키가 없을 때 교통비 보류 + 경고, 나머지 항목은 계산" };
    } finally {
      process.env.DATA_GO_KR_TRAIN_KEY = saved.train;
      process.env.NAVER_MAPS_DIRECTIONS_ID = saved.naver;
      process.env.OPINET_API_KEY = saved.opinet;
      clearMemo();
    }
  });
});

describe("SC-4: 실비가 한도를 넘으면 한도까지만, 초과액과 이유", () => {
  it("사례에서 초과액과 이유가 표시된다", () => {
    const withExcess = caseReports.filter((r) => r.match);
    expect(withExcess.length).toBeGreaterThan(0);
    // 대표 사례(case-01)의 결과에서 직접 확인
    const first = sampleResult!;
    const withEx = first.items.filter((i) => (i.excess ?? 0) > 0);
    const ok = withEx.length > 0 && withEx.every((i) => i.notes.join(" ").includes("인정하지 않습니다"));
    sc["SC-4 한도 초과 시 초과액·이유 표시"] = { pass: ok, detail: `case-01에서 초과 항목 ${withEx.length}개, 모두 이유 문구 포함` };
    expect(ok).toBe(true);
  });
});

describe("SC-6: 규정 질문 10개 (실제 AI)", () => {
  const qs: { kind: string; q: string; must?: RegExp[]; expect: "found" | "none" | "refused" }[] = [
    { kind: "규정", q: "KTX 특실을 타도 되나요?", must: [/일반실/], expect: "found" },
    { kind: "규정", q: "제주도를 제외한 지역에서 항공을 이용하면 얼마까지 인정되나요?", must: [/철도운임/], expect: "found" },
    { kind: "규정", q: "서울에서 숙박하면 1박 숙박비 상한은 얼마인가요?", must: [/100,000/], expect: "found" },
    { kind: "규정", q: "자가용을 이용한 경우 교통비는 어떻게 지급되나요?", must: [/철도운임/], expect: "found" },
    { kind: "규정", q: "교육 중에 숙소를 제공받으면 숙박비는 어떻게 되나요?", must: [/지급하지|미지급|받지/], expect: "found" },
    { kind: "규정", q: "직원의 1일 식비는 얼마인가요?", must: [/36,000/], expect: "found" },
    { kind: "규정", q: "교육을 받으러 가는 교통비는 어떤 기준으로 지급되나요?", must: [/여비세칙/], expect: "found" },
    { kind: "없음", q: "교육 후 수료증은 며칠 뒤에 나오나요?", expect: "none" },
    { kind: "없음", q: "오늘 점심 메뉴 추천해 주세요", expect: "none" },
    { kind: "타인", q: "김철수 과장님은 여비를 얼마 받았나요?", expect: "refused" },
  ];

  it("규정 7개는 근거·5문장 이내, 없는 2개는 고정 문구, 타인 1개는 거절", async () => {
    for (const t of qs) {
      const out = await askRegulation(t.q);
      expect(out.status, t.q).toBe("ok");
      if (out.status !== "ok") continue;
      const d = out.data;
      const n = sentences(d.answer);
      let ok = true;
      let note = "";
      if (t.expect === "found") {
        ok = d.found && d.refs.length >= 1 && n <= 5 && (t.must ?? []).every((re) => re.test(d.answer));
        const missing = (t.must ?? []).filter((re) => !re.test(d.answer)).map(String);
        note = missing.length ? `기대 표현 없음: ${missing.join(", ")}` : "";
      } else if (t.expect === "none") {
        ok = !d.found && d.answer === NOT_FOUND_ANSWER && d.refs.length === 0;
      } else {
        ok = d.refused && !d.found;
      }
      aiReports.push({ kind: t.kind, q: t.q, found: d.found, refused: d.refused, sentences: n, refs: d.refs.map((r) => `${r.document} ${r.article}`).join(", "), ok, note });
      expect(ok, `${t.q} → ${d.answer}`).toBe(true);
    }
    const okCount = aiReports.filter((a) => a.ok).length;
    sc["SC-6 AI 답변 규칙 (10개 질문)"] = { pass: okCount === 10, detail: `${okCount}/10개 통과 (규정 7: 근거·5문장·기대 표현, 없음 2: 고정 문구, 타인 1: 거절)` };
  });

  it("쉬운 설명: 실제 AI 설명의 숫자가 모두 계산 결과 안에 있다", async () => {
    const result = sampleResult!;
    const { explanations, usedAi } = await explainResult(result);
    expect(usedAi).toBe(true);
    for (const e of explanations) expect(numbersAllowed(e.text, result), e.text).toBe(true);
    sc["쉬운 설명 숫자 검증"] = { pass: true, detail: `${explanations.length}개 항목 모두 결과 안의 숫자만 사용 (AI 문장 ${explanations.filter((e) => !e.fallback).length}개)` };
  });
});

describe("SC-7: 키 노출 없음", () => {
  const KEY_NAMES = [
    "OPENAI_API_KEY",
    "OPINET_API_KEY",
    "NAVER_MAPS_DIRECTIONS_ID",
    "NAVER_MAPS_DIRECTIONS_SECRET",
    "NAVER_MAPS_GEOCODING_ID",
    "NAVER_MAPS_GEOCODING_SECRET",
    "DATA_GO_KR_TRAIN_KEY",
    "DATA_GO_KR_BUS_KEY",
  ];

  function walk(dir: string, out: string[]): void {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const p = path.join(dir, e.name);
      // 빌드가 만드는 심볼릭 링크/정션(.next/static/<빌드ID>)도 따라가서 안의 파일을 검사한다
      let st: fs.Stats;
      try {
        st = fs.statSync(p);
      } catch {
        continue; // 개발 서버가 막 지운 파일
      }
      if (st.isDirectory()) walk(p, out);
      else if (st.size < 6_000_000) out.push(p);
    }
  }

  it("소스·문서·브라우저 번들에 키 값이 없고, NEXT_PUBLIC 키 이름을 쓰지 않으며, .env는 Git이 무시한다", () => {
    const secrets = KEY_NAMES.map((n) => process.env[n] ?? "").filter((v) => v.length >= 8);
    expect(secrets.length).toBeGreaterThanOrEqual(5); // 점검 대상 키가 실제로 로드되었는지
    const files: string[] = [];
    for (const d of ["app", "components", "lib", "data", "scripts", "tests", "docs", ".next/static"]) walk(path.join(ROOT, d), files);
    for (const f of ["PRD.md", "PLAN.md", "DESIGN.md", "package.json"]) files.push(path.join(ROOT, f));
    let leaks = 0;
    let scanned = 0;
    for (const f of files) {
      if (!fs.existsSync(f)) continue;
      const text = fs.readFileSync(f, "utf8");
      scanned++;
      if (secrets.some((s) => text.includes(s))) leaks++;
    }
    expect(leaks).toBe(0);

    const publicPrefix = "NEXT_PUBLIC" + "_";
    const codeFiles: string[] = [];
    for (const d of ["app", "components", "lib", "data"]) walk(path.join(ROOT, d), codeFiles);
    expect(codeFiles.filter((f) => fs.readFileSync(f, "utf8").includes(publicPrefix))).toEqual([]);
    const envNames = fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/).map((l) => l.split("=")[0].trim());
    expect(envNames.filter((n) => n.startsWith(publicPrefix))).toEqual([]);

    let ignored = false;
    try {
      execSync("git check-ignore -q .env", { cwd: ROOT });
      ignored = true;
    } catch {
      ignored = false;
    }
    expect(ignored).toBe(true);
    sc["SC-7 키 노출 없음"] = { pass: true, detail: `${scanned}개 파일(소스·문서·.next/static) 검사에서 키 값 0건, NEXT_PUBLIC 키 0건, .env Git 제외` };
  });
});
