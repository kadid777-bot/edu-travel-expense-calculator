// Design Ref: §8 테스트 계획 — 채점 사례 20건(SC-1) + 입력 검사(L1) + API(L1)
// 계산 엔진(lib/calc)이 "따로 만든" 기준 계산식(tests/reference-calc.ts)과 같은 답을 내는지 비교한다.
// 외부 조회값은 시험용으로 고정해서 넣는다(실제 요금·유가 아님). 실제 연결 점검은 모듈 3에서 따로 한다.
import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "../app/api/calculate/route";
import { calculateExpense } from "../lib/calc/calculate";
import { validateInput } from "../lib/calc/schema";
import type { CalculationInput, LegInput, Lookups } from "../lib/calc/types";
import { findStations } from "../data/stations";
import cases from "./cases.json";
import { referenceCalc } from "./reference-calc";

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** 시험용 고정 조회값: 지역이 같으면 늘 같은 값. 대응 철도역이 없으면 조회 실패(null) */
function fixedLookups(input: CalculationInput): Lookups {
  const one = (leg: LegInput) => {
    const none = findStations(leg.sido, leg.sigungu).rail === null;
    const h = hash(`${leg.sido}${leg.sigungu}`);
    return {
      fare: none ? null : 12_000 + (h % 10) * 4_000,
      distanceKm: none ? null : 50 + (h % 30) * 10,
      gasolinePrice: 1_700,
    };
  };
  return { outbound: one(input.outbound), inbound: one(input.inbound) };
}

type CaseRow = { id: string; tags: string[]; input: CalculationInput };
const caseRows = cases as CaseRow[];

describe("채점 사례 20건: 계산 엔진 = 기준 계산식 (SC-1)", () => {
  it("사례가 20건이다", () => {
    expect(caseRows).toHaveLength(20);
  });

  it.each(caseRows.map((c) => [c.id, c.tags.join(" / "), c] as const))("%s (%s)", (_id, _tags, c) => {
    const lookups = fixedLookups(c.input);
    const ref = referenceCalc(c.input, lookups);
    const got = calculateExpense(c.input, lookups);
    const [out, inn, lodging, daily, meal] = got.items;

    expect(out.approved).toBe(ref.transportOutbound ?? 0);
    expect(inn.approved).toBe(ref.transportInbound ?? 0);
    expect(lodging.approved).toBe(ref.lodging);
    expect(daily.approved).toBe(ref.daily);
    expect(meal.approved).toBe(ref.meal);
    expect(got.total).toBe(ref.total);
    // 한도를 정할 수 없어 보류한 구간이 있으면 경고가 있어야 한다
    expect(got.warnings.length > 0).toBe(ref.held.length > 0);
    // 모든 항목에는 근거 조항이 1개 이상 붙는다 (SC-3)
    for (const item of got.items) expect(item.refs.length).toBeGreaterThanOrEqual(1);
    expect(got.items).toHaveLength(5);
  });
});

describe("계산 규칙", () => {
  const base: CalculationInput = {
    courseId: "course-01", // 서울 3일, 숙소·식사 미제공
    outbound: { sido: "부산광역시", sigungu: "해운대구", transport: "train", transportActual: 70_000 },
    inbound: { sido: "부산광역시", sigungu: "해운대구", transport: "train", transportActual: 50_000 },
    nights: 2,
    lodgingActuals: [120_000, 90_000],
  };
  const rail = (n: number | null) => ({ fare: n });

  it("열차: 실비와 열차요금 상한 중 낮은 금액을 인정하고 초과액·이유를 보여준다 (SC-4)", () => {
    const r = calculateExpense(base, { outbound: rail(60_000), inbound: rail(60_000) });
    expect(r.items[0].approved).toBe(60_000);
    expect(r.items[0].excess).toBe(10_000);
    expect(r.items[0].notes.join(" ")).toContain("상한");
    expect(r.items[1].approved).toBe(50_000);
    expect(r.items[1].excess).toBe(0);
  });

  it("숙박비: 1박마다 상한(서울 100,000원)과 비교한다 (총액이 아님)", () => {
    const r = calculateExpense(base, { outbound: rail(60_000), inbound: rail(60_000) });
    expect(r.items[2].approved).toBe(100_000 + 90_000);
    expect(r.items[2].excess).toBe(20_000);
  });

  it("고속버스도 열차요금이 상한이다", () => {
    const bus: CalculationInput = {
      ...base,
      outbound: { ...base.outbound, transport: "bus", transportActual: 32_000 },
    };
    const r = calculateExpense(bus, { outbound: rail(30_000), inbound: rail(60_000) });
    expect(r.items[0].approved).toBe(30_000);
  });

  it("자차: (거리 × 유가 ÷ 연비) + 하이패스, 열차요금 상한", () => {
    const car: CalculationInput = {
      ...base,
      outbound: { sido: "대전광역시", sigungu: "동구", transport: "car", tollActual: 8_000 },
    };
    const ok = calculateExpense(car, {
      outbound: { fare: 40_000, distanceKm: 150, gasolinePrice: 1_700 },
      inbound: rail(60_000),
    });
    expect(ok.items[0].approved).toBe(Math.floor((150 * 1_700) / 11.97) + 8_000);
    const capped = calculateExpense(car, {
      outbound: { fare: 25_000, distanceKm: 150, gasolinePrice: 1_700 },
      inbound: rail(60_000),
    });
    expect(capped.items[0].approved).toBe(25_000);
  });

  it("자차: 거리·유가 조회 실패 시 열차요금으로 대체하고 경고한다", () => {
    const car: CalculationInput = { ...base, outbound: { sido: "대전광역시", sigungu: "동구", transport: "car" } };
    const r = calculateExpense(car, { outbound: { fare: 30_000, distanceKm: null, gasolinePrice: null }, inbound: rail(60_000) });
    expect(r.items[0].approved).toBe(30_000);
    expect(r.warnings.join(" ")).toContain("거리·유가");
  });

  it("열차요금 조회 실패: 금액을 지어내지 않고 보류 + 경고 (SC-5)", () => {
    const r = calculateExpense(base, { outbound: rail(null), inbound: rail(60_000) });
    expect(r.items[0].approved).toBe(0);
    expect(r.warnings.join(" ")).toContain("요금을 조회하지 못했습니다");
    expect(r.items[2].approved).toBe(100_000 + 90_000); // 다른 항목은 계속 계산
  });

  it("육지 항공은 열차요금 상한, 제주 구간 항공은 실비 그대로", () => {
    const air: CalculationInput = { ...base, outbound: { ...base.outbound, transport: "air", transportActual: 90_000 } };
    expect(calculateExpense(air, { outbound: rail(30_000), inbound: rail(60_000) }).items[0].approved).toBe(30_000);
    const jeju: CalculationInput = {
      ...base,
      outbound: { sido: "제주특별자치도", sigungu: "제주시", transport: "air", transportActual: 90_000 },
    };
    expect(calculateExpense(jeju, { outbound: rail(null), inbound: rail(60_000) }).items[0].approved).toBe(90_000);
  });

  it("시내(교육 장소와 같은 시·군·구): 두 구간 모두면 전부 0원 + 안내", () => {
    const local: CalculationInput = {
      courseId: "course-05",
      outbound: { sido: "서울특별시", sigungu: "영등포구", transport: "bus", transportActual: 1_500 },
      inbound: { sido: "서울특별시", sigungu: "영등포구", transport: "bus", transportActual: 1_500 },
      nights: 0,
    };
    const r = calculateExpense(local, { outbound: rail(null), inbound: rail(null) });
    expect(r.total).toBe(0);
    expect(r.notices.join(" ")).toContain("시내 출장은 여비 지급 대상이 아닙니다");
    expect(r.shortDistance).toEqual({ outbound: true, inbound: true });
  });

  it("교육대상자 일비는 0원이고, 식사 제공 과정은 식비 0원", () => {
    const r = calculateExpense(base, { outbound: rail(60_000), inbound: rail(60_000) });
    expect(r.items[3].category).toBe("일비");
    expect(r.items[3].approved).toBe(0);
    expect(r.items[4].approved).toBe(36_000 * 3);
    const meals: CalculationInput = { ...base, courseId: "course-05", nights: 0, lodgingActuals: [] };
    expect(calculateExpense(meals, { outbound: rail(60_000), inbound: rail(60_000) }).items[4].approved).toBe(0);
  });

  it("같은 입력과 조회값이면 같은 결과가 나온다", () => {
    const l = { outbound: rail(60_000), inbound: rail(60_000) };
    expect(calculateExpense(base, l)).toEqual(calculateExpense(base, l));
  });
});

describe("입력 검사 (FR-01, FR-18)", () => {
  const ok = {
    courseId: "course-01",
    outbound: { sido: "부산광역시", sigungu: "해운대구", transport: "train", transportActual: 59_800 },
    inbound: { sido: "부산광역시", sigungu: "해운대구", transport: "train", transportActual: 59_800 },
    nights: 2,
    lodgingActuals: [95_000, 100_000],
  };

  it("올바른 입력은 통과한다", () => {
    expect(validateInput(ok).ok).toBe(true);
  });

  it("필수값이 비면 칸별 안내를 돌려준다", () => {
    const r = validateInput({ ...ok, outbound: { ...ok.outbound, transportActual: undefined } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors["outbound.transportActual"]).toContain("교통비 실비");
  });

  it("교육 과정이 없거나 목록에 없으면 오류", () => {
    expect(validateInput({ ...ok, courseId: "" }).ok).toBe(false);
    expect(validateInput({ ...ok, courseId: "course-99" }).ok).toBe(false);
  });

  it("목록에 없는 시·군·구는 거부한다", () => {
    const r = validateInput({ ...ok, outbound: { ...ok.outbound, sigungu: "없는구" } });
    expect(r.ok).toBe(false);
  });

  it("숙박 박수가 허용 범위를 넘으면 거부한다 (3일 과정은 최대 2박)", () => {
    const r = validateInput({ ...ok, nights: 3, lodgingActuals: [1, 2, 3] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.nights).toContain("2박");
  });

  it("박별 숙박비 개수가 박수와 다르면 거부한다", () => {
    const r = validateInput({ ...ok, lodgingActuals: [95_000] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.lodgingActuals).toBeDefined();
  });

  it("자차는 교통비 실비 없이도 통과한다", () => {
    const car = { ...ok, outbound: { sido: "대전광역시", sigungu: "동구", transport: "car" } };
    expect(validateInput(car).ok).toBe(true);
  });

  it("숙소를 제공하는 과정은 박별 숙박비 없이 통과한다", () => {
    const r = validateInput({ ...ok, courseId: "course-06", nights: 0, lodgingActuals: undefined });
    expect(r.ok).toBe(true);
  });

  it("금액이 음수이거나 숫자가 아니면 거부한다", () => {
    expect(validateInput({ ...ok, outbound: { ...ok.outbound, transportActual: -1 } }).ok).toBe(false);
    expect(validateInput({ ...ok, outbound: { ...ok.outbound, transportActual: "abc" } }).ok).toBe(false);
  });
});

describe("POST /api/calculate (L1)", () => {
  beforeAll(() => {
    process.env.MOCK_EXTERNAL = "1"; // 시험용 가상 조회값 사용
  });

  const body = {
    courseId: "course-01",
    outbound: { sido: "부산광역시", sigungu: "해운대구", transport: "train", transportActual: 59_800 },
    inbound: { sido: "부산광역시", sigungu: "해운대구", transport: "train", transportActual: 59_800 },
    nights: 2,
    lodgingActuals: [75_000, 75_000],
  };
  const call = (payload: unknown) =>
    POST(new Request("http://localhost/api/calculate", { method: "POST", body: JSON.stringify(payload) }));

  it("정상 입력: 200, 항목 5개, 근거 조항, 가상 조회 표시", async () => {
    const res = await call(body);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items).toHaveLength(5);
    expect(json.data.items.every((i: { refs: unknown[] }) => i.refs.length >= 1)).toBe(true);
    expect(json.meta.mockLookups).toBe(true);
    expect(typeof json.data.total).toBe("number");
  });

  it("필수값 누락: 400 + fieldErrors", async () => {
    const res = await call({ ...body, nights: 2, lodgingActuals: [75_000] });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.details.fieldErrors.lodgingActuals).toBeDefined();
  });

  it("courseId 누락은 400, 목록에 없는 courseId는 404", async () => {
    expect((await call({ ...body, courseId: undefined })).status).toBe(400);
    const res = await call({ ...body, courseId: "course-99" });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("COURSE_NOT_FOUND");
  });

  it("JSON이 아니면 400", async () => {
    const res = await POST(new Request("http://localhost/api/calculate", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });
});
