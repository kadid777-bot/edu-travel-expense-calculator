// Design Ref: §5.1 자주 묻는 질문 (nice) — 금액은 RULES(data/rules.ts)에서 가져와 규정 기준표와 어긋나지 않게 한다
import { RULES } from "../data/rules";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

const FAQS: { q: string; a: string }[] = [
  {
    q: "교통비는 얼마까지 인정되나요?",
    a: "실비를 지급하되, 근무지와 교육 장소 구간의 열차요금(일반실, 성인, 편도)을 넘지 않는 범위에서 인정해요. 같은 구간의 열차 종류별 요금이 다르면 가장 높은 일반실 요금을 상한으로 써요. 제주특별자치도 구간의 항공은 열차요금 상한 없이 실비를 인정해요.",
  },
  {
    q: "자가용으로 가면 교통비는 어떻게 계산하나요?",
    a: `(구간 거리 × 전국 평균 휘발유 가격 ÷ 연비 ${RULES.carFuelEfficiency.kmPerLiter}km/L) + 하이패스 실비로 계산하고, 열차요금(일반실)을 넘으면 열차요금까지만 인정해요.`,
  },
  {
    q: "숙박비 상한은 얼마인가요?",
    a: `1박마다 비교해요. 교육 장소가 서울특별시이면 1박 ${won(RULES.lodgingPerNight.seoul)}, 그 밖의 지역이면 1박 ${won(RULES.lodgingPerNight.other)}까지 인정하고, 총액이 아니라 박별로 적용해요. 교육기관이 숙소를 제공하면 지급하지 않아요.`,
  },
  {
    q: "식비는 얼마인가요?",
    a: `식비는 교육에 포함되는 경우가 많아 기본으로 지급하지 않아요(0원). 식사가 제공되지 않은 날이 있으면 "식비 청구 일수"를 입력하세요. 1일 ${won(RULES.mealAllowance.amount)} × 청구 일수로 계산하고, 교육 일수를 넘을 수 없어요. 교육기관이 식사를 제공하는 과정은 청구할 수 없어요.`,
  },
  {
    q: "일비는 받을 수 있나요?",
    a: "인력개발세칙 별표 3에는 교육 참가자 일비가 없어서 이 앱은 일비를 0원으로 계산해요.",
  },
  {
    q: "교육 장소와 같은 시·군에 살면 여비가 나오나요?",
    a: "교육 여비는 시외 출장만 지급 대상이에요. 출발지와 귀가지가 모두 교육 장소와 같은 시·군이면 전부 0원이고, 한 구간만 시내이면 그 구간 교통비만 0원이에요.",
  },
  {
    q: "요금을 조회하지 못했다고 나와요.",
    a: "열차요금 상한을 정할 수 없으면 금액을 지어내지 않고 교통비 인정을 보류해요. 직통 열차가 없는 구간이거나 외부 서비스가 일시적으로 응답하지 않은 경우예요. 잠시 후 다시 계산하거나 운영자에게 문의해 주세요.",
  },
];

export default function FaqList() {
  return (
    <section aria-label="자주 묻는 질문" className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">자주 묻는 질문</h2>
      <div className="space-y-2">
        {FAQS.map((f) => (
          <details key={f.q} className="rounded-2xl border border-[var(--md-outline-variant)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
            <p className="mt-2 text-sm text-[var(--md-on-surface-variant)]">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
