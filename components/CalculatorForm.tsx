"use client";

// Design Ref: §5.1 ① 내 여비 계산하기 — 입력 카드 (가는 편·오는 편 구간, 숙박 박수, 박별 숙박비)
import { useState } from "react";
import { SIDO_LIST, SIGUNGU } from "../data/sigungu";
import { countDays } from "../lib/calc/days";
import type { CalculationResult, Course, TransportMode } from "../lib/calc/types";
import EvidenceUpload from "./EvidenceUpload";
import ExplainPanel from "./ExplainPanel";
import ResultCard, { type ResultMeta } from "./ResultCard";

interface LegForm {
  sido: string;
  sigungu: string;
  transport: TransportMode;
  actual: string; // 기차·버스·항공 교통비 실비
  toll: string; // 자차 하이패스 실비
}

const EMPTY_LEG: LegForm = { sido: "", sigungu: "", transport: "train", actual: "", toll: "" };

const TRANSPORTS: { value: TransportMode; label: string }[] = [
  { value: "train", label: "기차" },
  { value: "air", label: "항공" },
  { value: "bus", label: "버스" },
  { value: "car", label: "자차" },
];

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900";
const labelCls = "mb-1 block text-sm font-medium";
const errCls = "mt-1 text-sm text-red-700 dark:text-red-400";

/** "" → undefined(비어 있음), 숫자 아님 → null(오류), 그 외 → 숫자 */
function toNumber(s: string): number | undefined | null {
  const t = s.replace(/[,\s원]/g, "");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function legPayload(v: LegForm) {
  return {
    sido: v.sido,
    sigungu: v.sigungu,
    transport: v.transport,
    transportActual: v.transport === "car" ? undefined : toNumber(v.actual),
    tollActual: v.transport === "car" ? toNumber(v.toll) : undefined,
  };
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className={errCls}>
          {error}
        </p>
      )}
    </div>
  );
}

function LegFields({
  idPrefix,
  title,
  placeLabel,
  value,
  onChange,
  placeLocked,
  errors,
  errKey,
}: {
  idPrefix: string;
  title: string;
  placeLabel: string;
  value: LegForm;
  onChange: (patch: Partial<LegForm>) => void;
  placeLocked?: boolean;
  errors: Record<string, string>;
  errKey: "outbound" | "inbound";
}) {
  const sigunguList = SIGUNGU[value.sido] ?? [];
  return (
    <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="px-1 font-medium">{title}</legend>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${idPrefix}-sido`} label={`${placeLabel} 시·도`} error={errors[`${errKey}.sido`]}>
          <select
            id={`${idPrefix}-sido`}
            className={inputCls}
            value={value.sido}
            disabled={placeLocked}
            onChange={(e) => onChange({ sido: e.target.value, sigungu: "" })}
          >
            <option value="">선택</option>
            {SIDO_LIST.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${idPrefix}-sigungu`} label={`${placeLabel} 시·군·구`} error={errors[`${errKey}.sigungu`]}>
          <select
            id={`${idPrefix}-sigungu`}
            className={inputCls}
            value={value.sigungu}
            disabled={placeLocked || value.sido === ""}
            onChange={(e) => onChange({ sigungu: e.target.value })}
          >
            <option value="">선택</option>
            {sigunguList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div>
        <span className={labelCls}>교통수단</span>
        <div className="flex flex-wrap gap-x-4 gap-y-2" role="radiogroup" aria-label={`${title} 교통수단`}>
          {TRANSPORTS.map((t) => (
            <label key={t.value} className="flex items-center gap-1.5 text-base">
              <input
                type="radio"
                name={`${idPrefix}-transport`}
                checked={value.transport === t.value}
                onChange={() => onChange({ transport: t.value })}
              />
              {t.label}
            </label>
          ))}
        </div>
        {errors[`${errKey}.transport`] && (
          <p role="alert" className={errCls}>
            {errors[`${errKey}.transport`]}
          </p>
        )}
      </div>

      {value.transport === "car" ? (
        <Field
          id={`${idPrefix}-toll`}
          label="하이패스 요금 실비 (원, 선택)"
          error={errors[`${errKey}.tollActual`]}
        >
          <input
            id={`${idPrefix}-toll`}
            className={inputCls}
            inputMode="numeric"
            placeholder="없으면 비워 두세요"
            value={value.toll}
            onChange={(e) => onChange({ toll: e.target.value })}
          />
        </Field>
      ) : (
        <Field id={`${idPrefix}-actual`} label="교통비 실비 (원, 편도)" error={errors[`${errKey}.transportActual`]}>
          <input
            id={`${idPrefix}-actual`}
            className={inputCls}
            inputMode="numeric"
            placeholder="예: 59800"
            value={value.actual}
            onChange={(e) => onChange({ actual: e.target.value })}
          />
        </Field>
      )}
    </fieldset>
  );
}

export default function CalculatorForm({ courses }: { courses: Course[] }) {
  const [courseId, setCourseId] = useState("");
  const [outbound, setOutbound] = useState<LegForm>(EMPTY_LEG);
  const [inbound, setInbound] = useState<LegForm>(EMPTY_LEG);
  const [sameReturn, setSameReturn] = useState(true);
  const [nights, setNights] = useState("0");
  const [lodging, setLodging] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [meta, setMeta] = useState<ResultMeta | null>(null);

  const course = courses.find((c) => c.id === courseId);
  const days = course ? countDays(course.startDate, course.endDate) : 0;
  const nightsCount = Math.max(0, Math.min(60, Number.parseInt(nights, 10) || 0));

  // 귀가지가 "가는 편 출발지와 같음"이면 오는 편 장소는 가는 편을 따라간다
  const inboundValue: LegForm = sameReturn
    ? { ...inbound, sido: outbound.sido, sigungu: outbound.sigungu }
    : inbound;

  function changeNights(value: string) {
    setNights(value);
    const n = Math.max(0, Math.min(60, Number.parseInt(value, 10) || 0));
    setLodging((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setMessage("");
    try {
      const payload = {
        courseId,
        outbound: legPayload(outbound),
        inbound: legPayload(inboundValue),
        nights: nightsCount,
        lodgingActuals: course?.lodgingProvided ? undefined : lodging.slice(0, nightsCount).map(toNumber),
      };
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult(null);
        setMeta(null);
        setErrors(json?.error?.details?.fieldErrors ?? {});
        setMessage(json?.error?.message ?? "계산하지 못했습니다. 입력을 확인해 주세요");
        return;
      }
      setResult(json.data);
      setMeta(json.meta);
    } catch {
      setResult(null);
      setMessage("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <h2 className="text-xl font-semibold">① 내 여비 계산하기</h2>

        <Field id="course" label="교육 과정" error={errors.courseId}>
          <select id="course" className={inputCls} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">과정을 선택하세요</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        {course && (
          <dl className="grid gap-x-6 gap-y-1 rounded-lg bg-zinc-100 p-3 text-sm sm:grid-cols-2 dark:bg-zinc-800">
            <div className="flex gap-2"><dt className="text-zinc-500">교육 장소</dt><dd>{course.venueAddress}</dd></div>
            <div className="flex gap-2"><dt className="text-zinc-500">기간</dt><dd>{course.startDate} ~ {course.endDate} ({days}일)</dd></div>
            <div className="flex gap-2"><dt className="text-zinc-500">숙소 제공</dt><dd>{course.lodgingProvided ? "예 (숙박비 미지급)" : "아니오"}</dd></div>
            <div className="flex gap-2"><dt className="text-zinc-500">식사 제공</dt><dd>{course.mealsProvided ? "예 (식비 미지급)" : "아니오"}</dd></div>
          </dl>
        )}

        <LegFields
          idPrefix="out"
          title="가는 편 (출발지 → 교육 장소)"
          placeLabel="출발지"
          value={outbound}
          onChange={(p) => setOutbound((v) => ({ ...v, ...p }))}
          errors={errors}
          errKey="outbound"
        />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sameReturn} onChange={(e) => setSameReturn(e.target.checked)} />
          오는 편 귀가지가 가는 편 출발지와 같아요
        </label>

        <LegFields
          idPrefix="in"
          title="오는 편 (교육 장소 → 귀가지)"
          placeLabel="귀가지"
          value={inboundValue}
          onChange={(p) => setInbound((v) => ({ ...v, ...p }))}
          placeLocked={sameReturn}
          errors={errors}
          errKey="inbound"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="nights"
            label={`숙박 박수${course ? ` (0 ~ ${Math.max(0, days - 1)}박)` : ""}`}
            error={errors.nights}
          >
            <input
              id="nights"
              type="number"
              min={0}
              className={inputCls}
              value={nights}
              onChange={(e) => changeNights(e.target.value)}
            />
          </Field>
        </div>

        {course?.lodgingProvided ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">이 과정은 숙소를 제공해서 숙박비를 입력하지 않아도 돼요.</p>
        ) : (
          nightsCount > 0 && (
            <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <legend className="px-1 font-medium">박별 숙박비 실비 (원)</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: nightsCount }, (_, i) => (
                  <Field key={i} id={`lodging-${i}`} label={`${i + 1}박째`} error={errors[`lodgingActuals.${i}`]}>
                    <input
                      id={`lodging-${i}`}
                      className={inputCls}
                      inputMode="numeric"
                      placeholder="예: 75000"
                      value={lodging[i] ?? ""}
                      onChange={(e) =>
                        setLodging((prev) => {
                          const next = Array.from({ length: nightsCount }, (_, j) => prev[j] ?? "");
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              {errors.lodgingActuals && (
                <p role="alert" className={errCls}>
                  {errors.lodgingActuals}
                </p>
              )}
            </fieldset>
          )
        )}

        {message && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {message}
          </p>
        )}

        <EvidenceUpload />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "계산하는 중…" : "여비 계산하기"}
        </button>
      </form>

      {result && meta && (
        <div className="space-y-4">
          <ResultCard result={result} meta={meta} />
          <ExplainPanel key={meta.fetchedAt} result={result} signature={meta.signature ?? ""} />
        </div>
      )}
    </div>
  );
}
