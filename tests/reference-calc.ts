// Design Ref: §8.5 — 정답을 구하는 "손계산 방식" 기준 계산식
// 앱의 계산 엔진(lib/calc, 모듈 2)과 일부러 따로 만든다. 같은 입력에 같은 답이 나와야 채점에 통과한다.
// 외부 조회 값은 직접 넣어 주고(Lookups), 이 파일은 네트워크를 쓰지 않는다.
import { COURSES } from "../data/courses";
import { RULES } from "../data/rules";
import type { CalculationInput, LegInput } from "../lib/calc/types";

/** 구간 하나의 외부 조회값 (편도). null = 조회 실패 */
export interface LegLookup {
  /** 근무지~교육장소 구간 열차요금(일반실, 편도). 열차·버스·자차·항공 모두의 상한 */
  fare: number | null;
  /** 자차 연료비 계산용 편도 거리(km) */
  distanceKm?: number | null;
  /** 출장 당일(가는 편=교육 시작일, 오는 편=종료일) 보통휘발유 전국 평균 판매가격(원/L) */
  gasolinePrice?: number | null;
}

export interface Lookups {
  outbound: LegLookup;
  inbound: LegLookup;
}

export interface ReferenceResult {
  transportOutbound: number | null; // null = 한도를 정할 수 없어 인정 보류
  transportInbound: number | null;
  lodging: number;
  daily: number;
  meal: number;
  total: number; // 보류된 항목은 0으로 더한다
  held: string[]; // 보류된 구간 설명
  shortDistanceFlat: boolean;
}

const JEJU = "제주특별자치도";
const SEOUL = "서울특별시";

function countDays(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1; // 양 끝 날짜 포함
}

function dailyAllowanceTotal(days: number): number {
  let total = 0;
  for (let d = 1; d <= days; d++) {
    let rate = 1;
    for (const r of RULES.dailyReduction) {
      if (d > r.afterDays) {
        rate = 1 - r.rate;
        break; // dailyReduction은 큰 기준일부터 정렬돼 있음
      }
    }
    total += RULES.dailyAllowance.amount * rate;
  }
  return Math.floor(total);
}

function legApproved(
  leg: LegInput,
  otherEndSido: string,
  lookup: LegLookup,
): number | null {
  const rail = lookup.fare; // 같은 구간 열차요금(일반실, 편도) — 모든 교통수단의 상한
  const touchesJeju = leg.sido === JEJU || otherEndSido === JEJU;
  if (leg.transport === "air" && touchesJeju) {
    // 제9조 제5항: 제주특별자치도 구간은 철도운임 한도가 없고 항공 실비
    return leg.transportActual ?? null;
  }
  if (rail === null) return null; // 상한을 정할 수 없음 → 인정 보류
  if (leg.transport === "car") {
    // 자차 = (거리 × 출장 당일 유가 ÷ 연비) + 하이패스 실비, 상한 = 열차요금(일반실)
    // 거리·유가 조회가 실패하면 열차요금으로 대체(통행료는 반영하지 않음)
    const fuel =
      lookup.distanceKm != null && lookup.gasolinePrice != null
        ? Math.floor((lookup.distanceKm * lookup.gasolinePrice) / RULES.carFuelEfficiency.kmPerLiter)
        : null;
    const amount = fuel === null ? rail : fuel + (leg.tollActual ?? 0);
    return Math.floor(Math.min(amount, rail));
  }
  // 열차·고속버스·항공: 실비 지급, 상한 = 열차요금(일반실). 버스도 버스 요금이 아니라 열차요금이 상한
  if (leg.transportActual === undefined) {
    throw new Error("기차·버스·항공은 교통비 실비가 필요합니다");
  }
  return Math.floor(Math.min(leg.transportActual, rail));
}

export function referenceCalc(input: CalculationInput, lookups: Lookups): ReferenceResult {
  const course = COURSES.find((c) => c.id === input.courseId);
  if (!course) throw new Error(`없는 교육 과정: ${input.courseId}`);

  const days = countDays(course.startDate, course.endDate);
  const city = (sido: string, sg: string) => (/(특별시|광역시|특별자치시)$/.test(sido) ? (/군$/.test(sg) ? sido + "|" + sg : sido) : sido + "|" + sg.split(" ")[0]);
  const sameZone = (leg: LegInput) =>
    city(leg.sido, leg.sigungu) === city(course.venueSido, course.venueSigungu);

  // 교육 여비는 시외출장만 대상이다. 두 구간 모두 교육 장소와 같은 시·군·구(시내)이면 여비를 지급하지 않는다.
  // 한 구간만 시내이면 그 구간의 교통비만 0원이고, 숙박비·식비는 시외 구간이 있으므로 지급한다(해석 — 확인 필요).
  if (sameZone(input.outbound) && sameZone(input.inbound)) {
    return {
      transportOutbound: 0, transportInbound: 0, lodging: 0, daily: 0, meal: 0,
      total: RULES.shortDistance.flatTotal, held: [], shortDistanceFlat: true,
    };
  }

  const capPerNight =
    course.venueSido === SEOUL ? RULES.lodgingPerNight.seoul : RULES.lodgingPerNight.other;
  const actuals = input.lodgingActuals ?? [];
  if (actuals.length !== input.nights) throw new Error("박별 숙박비 개수가 숙박 박수와 다릅니다");
  let lodging = 0;
  if (!course.lodgingProvided) {
    for (const a of actuals) lodging += Math.min(a, capPerNight); // 1박마다 비교
  } // 숙소를 제공하는 교육은 숙박비 미지급 (인력개발세칙 별표 3 제1호 가목)

  const out = sameZone(input.outbound)
    ? 0
    : legApproved(input.outbound, course.venueSido, lookups.outbound);
  const inn = sameZone(input.inbound)
    ? 0
    : legApproved(input.inbound, course.venueSido, lookups.inbound);
  const held: string[] = [];
  if (out === null) held.push("가는 편 교통비 한도 산출 불가");
  if (inn === null) held.push("오는 편 교통비 한도 산출 불가");

  // 교육대상자에게는 일비가 없고(별표 3 제1호), 식사를 제공하는 교육은 식비를 지급하지 않는다
  const daily = RULES.dailyAllowance.applies ? dailyAllowanceTotal(days) : 0;
  const meal = course.mealsProvided ? 0 : RULES.mealAllowance.amount * days;

  return {
    transportOutbound: out,
    transportInbound: inn,
    lodging,
    daily,
    meal,
    total: (out ?? 0) + (inn ?? 0) + lodging + daily + meal,
    held,
    shortDistanceFlat: false,
  };
}
