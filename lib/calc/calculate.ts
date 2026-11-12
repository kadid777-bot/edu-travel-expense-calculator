// Design Ref: §2.2 처리 5 — 계산 엔진 (순수 함수: 네트워크·화면을 모른다)
// 금액은 모두 코드(정해진 공식)가 계산한다. 외부 조회값은 Lookups로 받는다.
import { COURSES } from "../../data/courses";
import { RULES } from "../../data/rules";
import { countDays, won } from "./days";
import type {
  CalculationInput,
  CalculationResult,
  Course,
  ExpenseItem,
  LegInput,
  LegLookup,
  Lookups,
  RuleRef,
} from "./types";

import { isLocalLeg } from "./zone";
const JEJU = "제주특별자치도";
const SEOUL = "서울특별시";
const LOCAL_NOTICE = "시내 출장은 여비 지급 대상이 아닙니다";

type LegCategory = "교통비(가는 편)" | "교통비(오는 편)";

const isLocal = isLocalLeg;

/** 교통비 한 구간(편도)을 계산한다 */
function legItem(
  category: LegCategory,
  leg: LegInput,
  course: Course,
  lookup: LegLookup,
  warnings: string[],
): ExpenseItem {
  const rule = RULES.transportLimit[leg.transport];
  const refs: RuleRef[] = [rule.ref];
  const notes: string[] = [];
  const rail = lookup.fare; // 같은 구간 열차요금(일반실, 편도) — 모든 수단의 상한

  if (isLocal(leg, course)) {
    return {
      category,
      approved: 0,
      refs: [RULES.shortDistance.ref],
      notes: [`교육 장소와 같은 시·군·구라 시내 구간입니다. ${LOCAL_NOTICE}`],
    };
  }

  // 제9조 제5항: 제주특별자치도 구간의 항공은 열차요금 상한 없이 실비
  const touchesJeju = leg.sido === JEJU || course.venueSido === JEJU;
  if (leg.transport === "air" && touchesJeju) {
    const actual = leg.transportActual ?? 0;
    notes.push("제주특별자치도 구간의 항공은 열차요금 상한 없이 실비를 인정합니다");
    return { category, actual, approved: actual, refs, notes };
  }

  if (leg.transport === "air") notes.push("항공 한도는 철도 요금 기준입니다");
  if (leg.transport === "bus") notes.push("고속버스도 버스 요금이 아니라 열차요금(일반실)이 상한입니다");

  // 상한이 되는 열차요금을 모르면 한도 산출 불가 → 인정 보류
  if (rail === null) {
    warnings.push(`${category}: 요금을 조회하지 못했습니다`);
    notes.push("열차요금 상한을 정할 수 없어 인정을 보류했습니다. 운영자에게 문의해 주세요");
    return { category, actual: leg.transportActual, approved: 0, refs, notes };
  }

  if (leg.transport === "car") {
    // 자차 = (거리 × 출장 당일 유가 ÷ 연비) + 하이패스 실비, 상한 = 열차요금(일반실)
    const kmPerLiter = RULES.carFuelEfficiency.kmPerLiter;
    const toll = leg.tollActual ?? 0;
    const hasFuelInputs = lookup.distanceKm != null && lookup.gasolinePrice != null;
    const fuel = hasFuelInputs
      ? Math.floor((lookup.distanceKm! * lookup.gasolinePrice!) / kmPerLiter)
      : null;
    const amount = fuel === null ? rail : fuel + toll;
    const approved = Math.floor(Math.min(amount, rail));
    refs.push(RULES.carFuelEfficiency.ref);
    if (fuel === null) {
      warnings.push(`${category}: 거리·유가를 조회하지 못했습니다`);
      notes.push("거리·유가를 조회하지 못해 같은 구간 열차요금(일반실)으로 대체했습니다");
    } else if (amount > rail) {
      notes.push(`산출 금액 ${won(amount)}이 열차요금(일반실) 상한 ${won(rail)}을 넘어 상한까지만 인정합니다`);
    }
    const calcValues: Record<string, number> = { 열차요금상한: rail, 하이패스실비: toll, 연비: kmPerLiter };
    if (fuel !== null) {
      calcValues["거리(km)"] = lookup.distanceKm!;
      calcValues["유가(원/L)"] = lookup.gasolinePrice!;
      calcValues["연료비"] = fuel;
    }
    return {
      category,
      actual: amount,
      limit: rail,
      approved,
      excess: Math.max(0, amount - approved),
      refs,
      notes,
      calcValues,
    };
  }

  // 열차·고속버스·항공: 실비 지급, 상한 = 열차요금(일반실)
  const actual = leg.transportActual ?? 0;
  const approved = Math.floor(Math.min(actual, rail));
  if (actual > approved) {
    notes.push(`실비 ${won(actual)} 중 ${won(actual - approved)}은 열차요금(일반실) 상한 ${won(rail)}을 넘어 인정하지 않습니다`);
  }
  return {
    category,
    actual,
    limit: rail,
    approved,
    excess: actual - approved,
    refs,
    notes,
    calcValues: { 열차요금상한: rail },
  };
}

function lodgingItem(input: CalculationInput, course: Course): ExpenseItem {
  const ref = RULES.lodgingPerNight.ref;
  if (course.lodgingProvided) {
    return {
      category: "숙박비",
      approved: 0,
      refs: [ref],
      notes: ["교육기관이 숙소를 제공하는 과정이라 숙박비를 지급하지 않습니다"],
    };
  }
  const cap = course.venueSido === SEOUL ? RULES.lodgingPerNight.seoul : RULES.lodgingPerNight.other;
  const actuals = input.lodgingActuals ?? [];
  let approved = 0;
  let actualSum = 0;
  const notes: string[] = [];
  actuals.forEach((a, i) => {
    const ok = Math.min(a, cap); // 1박마다 비교 (총액으로 비교하지 않는다)
    approved += ok;
    actualSum += a;
    if (a > ok) notes.push(`${i + 1}박째: 실비 ${won(a)} 중 ${won(a - ok)}은 1박 상한 ${won(cap)}을 넘어 인정하지 않습니다`);
  });
  if (input.nights === 0) notes.push("숙박 없이 당일 교육이라 숙박비는 0원입니다");
  return {
    category: "숙박비",
    actual: actualSum,
    limit: cap * input.nights,
    approved,
    excess: actualSum - approved,
    refs: [ref],
    notes,
    calcValues: { 박수: input.nights, "1박상한": cap },
  };
}

/** 여비를 계산한다. 같은 입력과 같은 조회값이면 언제나 같은 결과가 나온다 */
export function calculateExpense(input: CalculationInput, lookups: Lookups): CalculationResult {
  const course = COURSES.find((c) => c.id === input.courseId);
  if (!course) throw new Error(`없는 교육 과정: ${input.courseId}`);

  const days = countDays(course.startDate, course.endDate);
  const localOut = isLocal(input.outbound, course);
  const localIn = isLocal(input.inbound, course);
  const warnings: string[] = [];
  const notices: string[] = [];

  // 교육 여비는 시외출장만 대상: 두 구간 모두 시내이면 모든 항목 0원
  if (localOut && localIn) {
    const zero = (category: ExpenseItem["category"], ref: RuleRef): ExpenseItem => ({
      category,
      approved: 0,
      refs: [ref],
      notes: [LOCAL_NOTICE],
    });
    return {
      items: [
        zero("교통비(가는 편)", RULES.shortDistance.ref),
        zero("교통비(오는 편)", RULES.shortDistance.ref),
        zero("숙박비", RULES.lodgingPerNight.ref),
        zero("일비", RULES.dailyAllowance.ref),
        zero("식비", RULES.mealAllowance.ref),
      ],
      total: RULES.shortDistance.flatTotal,
      warnings,
      notices: [LOCAL_NOTICE],
      shortDistance: { outbound: true, inbound: true },
    };
  }

  if (localOut !== localIn) {
    notices.push("한 구간만 시내입니다. 시내 구간의 교통비는 0원이고, 숙박비·식비는 시외 구간이 있어 지급합니다");
  }

  const outItem = legItem("교통비(가는 편)", input.outbound, course, lookups.outbound, warnings);
  const inItem = legItem("교통비(오는 편)", input.inbound, course, lookups.inbound, warnings);
  const lodging = lodgingItem(input, course);

  // 교육대상자 집행기준(인력개발세칙 별표 3 제1호)에 일비가 없어 항상 0원. 규정이 바뀌어 applies가 true가 되면
  // 이 항목을 계산하도록 확장해야 하므로, 모르는 채로 0원이 나오지 않게 오류로 알린다
  if (RULES.dailyAllowance.applies) throw new Error("일비 지급 계산이 아직 구현되지 않았습니다");
  const daily: ExpenseItem = {
    category: "일비",
    approved: 0,
    refs: [RULES.dailyAllowance.ref],
    notes: ["교육대상자에게는 일비를 지급하지 않습니다"],
  };

  const mealAmount = course.mealsProvided ? 0 : RULES.mealAllowance.amount * days;
  const meal: ExpenseItem = {
    category: "식비",
    approved: mealAmount,
    refs: [RULES.mealAllowance.ref],
    notes: course.mealsProvided ? ["교육기관이 식사를 제공하는 과정이라 식비를 지급하지 않습니다"] : [],
    calcValues: { 교육일수: days, "1일식비": RULES.mealAllowance.amount },
  };

  const items = [outItem, inItem, lodging, daily, meal];
  return {
    items,
    total: items.reduce((sum, it) => sum + it.approved, 0),
    warnings,
    notices,
    shortDistance: { outbound: localOut, inbound: localIn },
  };
}
