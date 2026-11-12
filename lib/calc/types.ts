// Design Ref: §3.1 데이터 정의, §3.2 규정 기준표 — 계산에 쓰는 데이터의 모양

/** 교통수단: 기차 / 항공 / 버스 / 자차 */
export type TransportMode = "train" | "air" | "bus" | "car";

/** 규정 근거 (어느 문서의 몇 조인지) */
export interface RuleRef {
  document: "여비세칙" | "인력개발세칙";
  article: string; // 예: "별표 1 제1호(직원 일비)"
}

/** 교육 과정 (data/courses.ts의 고정 목록) */
export interface Course {
  id: string;
  name: string;
  venueName: string;
  venueAddress: string;
  venueSido: string; // 숙박비 상한 지역 판정용 (서울 / 서울 외)
  venueSigungu: string; // 근거리 판정용
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  /** 교육기관이 숙소를 제공하면 숙박비 미지급 (인력개발세칙 별표 3 제1호 가목) */
  lodgingProvided: boolean;
  /** 교육기관이 식사를 제공하면 식비 미지급 (인력개발세칙 별표 3 제1호 나목) */
  mealsProvided: boolean;
}

/** 구간 입력 (편도 1개). 가는 편=출발지, 오는 편=귀가지 */
export interface LegInput {
  sido: string;
  sigungu: string;
  transport: TransportMode;
  /** 기차·버스·항공: 구간 교통비 실비(원, 편도). 자차는 사용하지 않는다 */
  transportActual?: number;
  /** 자차: 하이패스(통행료) 실비(원, 편도). 없으면 0 */
  tollActual?: number;
}

/** 계산 요청 */
export interface CalculationInput {
  courseId: string;
  outbound: LegInput; // 출발지 → 교육 장소
  inbound: LegInput; // 교육 장소 → 귀가지
  nights: number; // 숙박 박수
  lodgingActuals?: number[]; // 박별 숙박비 실비. 길이 = nights
}

/** 항목별 결과 */
export interface ExpenseItem {
  category: "교통비(가는 편)" | "교통비(오는 편)" | "숙박비" | "일비" | "식비";
  actual?: number;
  limit?: number;
  approved: number;
  excess?: number;
  refs: RuleRef[];
  notes: string[];
  calcValues?: Record<string, number>;
}

/** 구간 하나의 외부 조회값(편도). null = 조회 실패 */
export interface LegLookup {
  /** 근무지~교육장소 구간 열차요금(일반실, 편도). 열차·버스·자차·항공 모두의 상한 */
  fare: number | null;
  /** 자차 연료비 계산용 편도 거리(km) */
  distanceKm?: number | null;
  /** 출장 당일(가는 편=교육 시작일, 오는 편=종료일) 보통휘발유 전국 평균 판매가격(원/L) */
  gasolinePrice?: number | null;
}

/** 계산 엔진에 넣어 주는 외부 조회값. 엔진은 네트워크를 쓰지 않는다 */
export interface Lookups {
  outbound: LegLookup;
  inbound: LegLookup;
}

/** 계산 결과 */
export interface CalculationResult {
  items: ExpenseItem[];
  total: number;
  /** 외부 조회 실패 등 문제가 있는 경우의 경고 (예: "요금을 조회하지 못했습니다") */
  warnings: string[];
  /** 결과를 이해하는 데 필요한 안내 (예: "시내 출장은 여비 지급 대상이 아닙니다") */
  notices: string[];
  shortDistance: { outbound: boolean; inbound: boolean };
}

/** 규정 기준표 (값은 모두 규정 원문에서 옮기고, 조항 번호를 붙인다) */
export interface RuleTable {
  /** 이 기준표가 적용되는 대상 */
  appliesTo: "직원";
  transportLimit: Record<
    TransportMode,
    { amount?: number; fareClass?: string; ref: RuleRef }
  >;
  lodgingPerNight: { seoul: number; other: number; ref: RuleRef };
  /** 교육 일수 − 1 박에 더해 허용하는 전일 숙박 박수 (규정에 명시 없음 → 0, 확인 필요) */
  extraNightsAllowed: number;
  /** 일비: 교육대상자 집행기준(인력개발세칙 별표 3)에 일비 항목이 없어 applies=false (결과에는 0원으로 표시) */
  dailyAllowance: { amount: number; applies: boolean; ref: RuleRef };
  mealAllowance: { amount: number; ref: RuleRef };
  /** 동일지 장기 체류 시 일비 감액: N일 초과 일수에 정액의 rate 만큼 감액 */
  dailyReduction: { afterDays: number; rate: number }[];
  dailyReductionRef: RuleRef;
  /** 근거리(시내) 구간: 교육에는 여비를 지급하지 않으므로 flatTotal = 0 */
  shortDistance: {
    flatTotal: number; // 시내 출장 정액 (교육에는 0)
    lodgingAllowed: boolean;
    skipExternalLookup: boolean;
    ref: RuleRef;
  };
  /** 자가용 연료비 계산용 연비 (휘발유 승용차, km/L) */
  carFuelEfficiency: { kmPerLiter: number; ref: RuleRef };
}
