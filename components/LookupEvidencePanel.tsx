// 교육생이 한도 금액이 어떻게 나왔는지 직접 확인하는 "조회 근거" 화면
// - 철도: 구간·조회일·열차 종류별 일반실 요금표(상한 = 가장 높은 요금) + 코레일 바로가기
// - 자차: 네이버 지도 길찾기 링크와 조회 거리, 오피넷 전국 평균 휘발유 가격·기준일과 바로가기
import { won } from "../lib/calc/days";
import type { LegEvidence, LookupEvidence } from "../lib/external/lookups";
import EvidenceScreens from "./EvidenceScreens";

function ymd(s: string): string {
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

const linkCls = "text-blue-700 underline underline-offset-2 dark:text-blue-300";

function RailTable({ leg }: { leg: LegEvidence }) {
  const rail = leg.rail!;
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <strong>{leg.label}</strong> · {leg.from} → {leg.to}
      </p>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        상한이 된 구간 {rail.depStation}역 → {rail.arrStation}역 · 조회일 {ymd(rail.refDate)}
        {rail.substituted && " (교육일의 시간표가 아직 없어 가까운 날로 대신 조회)"}
      </p>
      {rail.routes.length > 1 && (
        <table className="w-full max-w-sm text-sm">
          <caption className="mb-1 text-left text-xs text-zinc-600 dark:text-zinc-400">
            이용할 수 있는 역별 최고 요금 (서울은 서울역·용산역·수서역을 모두 비교해요)
          </caption>
          <tbody>
            {rail.routes.map((r) => (
              <tr key={`${r.depStation}-${r.arrStation}`} className={r.fare === rail.cap ? "font-semibold" : ""}>
                <td className="py-0.5 pr-3">
                  {r.depStation}역 → {r.arrStation}역{r.fare === rail.cap && " ← 상한"}
                </td>
                <td className="py-0.5 text-right tabular-nums">{won(r.fare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <table className="w-full max-w-sm text-sm">
        <caption className="sr-only">열차 종류별 일반실 성인 요금</caption>
        <thead>
          <tr className="border-b border-zinc-300 text-left dark:border-zinc-700">
            <th className="py-1 pr-3 font-medium">열차 종류</th>
            <th className="py-1 text-right font-medium">일반실 요금(성인, 편도)</th>
          </tr>
        </thead>
        <tbody>
          {rail.grades.map((g) => (
            <tr key={g.grade} className={g.fare === rail.cap ? "font-semibold" : ""}>
              <td className="py-1 pr-3">
                {g.grade}
                {g.fare === rail.cap && " ← 상한"}
              </td>
              <td className="py-1 text-right tabular-nums">{won(g.fare)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs">
        같은 구간에서 열차 종류별 요금이 다르면 <strong>가장 높은 일반실 요금 {won(rail.cap)}</strong>이 교통비 한도(상한)예요.
      </p>
    </div>
  );
}

export default function LookupEvidencePanel({ evidence, fetchedAt }: { evidence: LookupEvidence; fetchedAt: string }) {
  const railLegs = evidence.legs.filter((l) => l.rail);
  const carLegs = evidence.legs.filter((l) => l.car);
  if (railLegs.length === 0 && carLegs.length === 0 && !evidence.gasoline) return null;

  return (
    <details open className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <summary className="cursor-pointer font-medium">한도 금액은 이렇게 나왔어요 (조회 근거 확인)</summary>
      <div className="mt-4 space-y-6">
        {railLegs.length > 0 && (
          <section aria-label="철도 요금 조회 결과" className="space-y-4">
            <h3 className="font-semibold">철도 요금 조회 결과</h3>
            {railLegs.map((leg) => (
              <RailTable key={leg.label} leg={leg} />
            ))}
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              요금은 국토교통부 열차정보 조회값이에요. 실제 승차권 요금은{" "}
              <a className={linkCls} href={evidence.links.korail} target="_blank" rel="noopener noreferrer">
                코레일
              </a>
              에서 같은 구간·날짜로 직접 비교해 볼 수 있어요.
            </p>
          </section>
        )}

        {(carLegs.length > 0 || evidence.gasoline) && (
          <section aria-label="자차 거리·휘발유 가격 조회 결과" className="space-y-4">
            <h3 className="font-semibold">자차 교통비 조회 결과</h3>
            {carLegs.map((leg) => (
              <p key={leg.label} className="text-sm">
                <strong>{leg.label}</strong> · {leg.from} → {leg.to}: 자동차 거리 <strong>{leg.car!.distanceKm}km</strong>{" "}
                (네이버 지도 조회, 시·군·구 대표 위치 기준) ·{" "}
                <a className={linkCls} href={leg.car!.naverUrl} target="_blank" rel="noopener noreferrer">
                  네이버 지도에서 경로 보기
                </a>
              </p>
            ))}
            {evidence.gasoline && (
              <p className="text-sm">
                전국 평균 보통휘발유 <strong>{evidence.gasoline.price.toLocaleString("ko-KR")}원/L</strong> (오피넷 기준일{" "}
                {ymd(evidence.gasoline.tradeDate)}) ·{" "}
                <a className={linkCls} href={evidence.links.opinet} target="_blank" rel="noopener noreferrer">
                  오피넷에서 확인하기
                </a>
              </p>
            )}
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              자차 교통비 = (거리 × 휘발유 가격 ÷ 연비) + 하이패스 실비이고, 위 철도 요금 상한을 넘으면 상한까지만 인정해요. 링크가
              열리지 않거나 경로가 다르면 지도에서 두 지역을 직접 검색해 비교해 보세요.
            </p>
            <EvidenceScreens evidence={evidence} fetchedAt={fetchedAt} />
          </section>
        )}
      </div>
    </details>
  );
}
