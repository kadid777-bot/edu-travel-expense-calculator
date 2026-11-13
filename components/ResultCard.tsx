// Design Ref: §5.1 ② 계산 결과 — 항목별 금액·근거 조항·초과 안내·경고·계산에 쓴 값
import { won } from "../lib/calc/days";
import type { CalculationResult } from "../lib/calc/types";
import type { LookupEvidence } from "../lib/external/lookups";
import LookupEvidencePanel from "./LookupEvidencePanel";

export interface ResultMeta {
  mockLookups: boolean;
  fetchedAt: string;
  /** 조회 조건 안내 (예: 유가 기준일) */
  notes?: string[];
  /** 한도 산출에 쓴 조회 근거 (직접 확인용) */
  evidence?: LookupEvidence;
  /** 서버가 붙인 서명 (설명 요청에 그대로 돌려보낸다) */
  signature?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR");
}

export default function ResultCard({ result, meta }: { result: CalculationResult; meta: ResultMeta }) {
  return (
    <section aria-label="계산 결과" className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">② 계산 결과</h2>

      {meta.mockLookups && (
        <p role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          화면 확인용 <b>가상 요금</b>으로 계산한 결과예요. 실제 열차요금·거리·유가가 아니에요. (외부 연결은 다음 단계에서 붙여요)
        </p>
      )}

      {result.warnings.map((w) => (
        <p key={w} role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          ⚠ {w}
        </p>
      ))}
      {result.notices.map((n) => (
        <p key={n} role="status" className="rounded-2xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
          ⓘ {n}
        </p>
      ))}

      <ul className="space-y-3">
        {result.items.map((item) => (
          <li key={item.category} className="rounded-3xl border border-[var(--md-outline-variant)] bg-[var(--md-lowest)] p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-medium">{item.category}</h3>
              <p className="text-lg font-semibold tabular-nums">{won(item.approved)}</p>
            </div>

            {(item.actual !== undefined || item.limit !== undefined) && (
              <p className="mt-1 text-sm text-[var(--md-on-surface-variant)] tabular-nums">
                {item.actual !== undefined && <>실비·산출 {won(item.actual)}</>}
                {item.limit !== undefined && <> · 한도 {won(item.limit)}</>}
                {item.excess !== undefined && item.excess > 0 && (
                  <span className="font-medium text-red-700 dark:text-red-400"> · 초과 {won(item.excess)}</span>
                )}
              </p>
            )}

            {item.notes.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-[var(--md-on-surface-variant)]">
                {item.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}

            {item.calcValues && (
              <p className="mt-2 flex flex-wrap gap-1.5 text-xs text-[var(--md-on-surface-variant)]">
                <span className="mr-1 text-[var(--md-on-surface-variant)]">계산에 쓴 값</span>
                {Object.entries(item.calcValues).map(([k, v]) => (
                  <span key={k} className="rounded bg-[var(--md-container-high)] px-1.5 py-0.5 tabular-nums">
                    {k} {v.toLocaleString("ko-KR")}
                  </span>
                ))}
              </p>
            )}

            <p className="mt-2 text-xs text-[var(--md-on-surface-variant)]">
              근거: {item.refs.map((r) => `${r.document} ${r.article}`).join(" / ")}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between rounded-3xl bg-[var(--md-primary)] px-4 py-3 text-[var(--md-on-primary)]">
        <span className="font-medium">합계</span>
        <span className="text-2xl font-bold tabular-nums">{won(result.total)}</span>
      </div>
      {meta.evidence && <LookupEvidencePanel evidence={meta.evidence} fetchedAt={meta.fetchedAt} />}
      {meta.notes && meta.notes.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-[var(--md-on-surface-variant)]">
          {meta.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {meta.fetchedAt && <p className="text-xs text-[var(--md-on-surface-variant)]">조회·계산 시각 {formatTime(meta.fetchedAt)}</p>}
    </section>
  );
}
