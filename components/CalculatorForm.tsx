"use client";

// Design Ref: §5.1 ① 내 여비 계산하기 — 입력 카드 (가는 편·오는 편 구간, 숙박 박수, 박별 숙박비)
import { useEffect, useState } from "react";
import { SIDO_LIST, SIGUNGU } from "../data/sigungu";
import { CUSTOM_COURSE_ID, customToCourse } from "../lib/calc/course";
import CourseFields, { EMPTY_COURSE } from "./CourseFields";
import { countDays } from "../lib/calc/days";
import type { CalculationResult, CustomCourseInput, TransportMode } from "../lib/calc/types";
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
        <p role="alert" data-field-error data-error-for={id} className={errCls}>
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
          <p role="alert" data-field-error className={errCls}>
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

export default function CalculatorForm() {
  const courseId = CUSTOM_COURSE_ID; // 교육 장소·기간은 교육생이 직접 입력한다 (data/courses.ts에 등록된 과정은 없다)
  const [outbound, setOutbound] = useState<LegForm>(EMPTY_LEG);
  const [inbound, setInbound] = useState<LegForm>(EMPTY_LEG);
  const [sameReturn, setSameReturn] = useState(true);
  const [nights, setNights] = useState("0");
  const [lodging, setLodging] = useState<string[]>([]);
  const [mealDays, setMealDays] = useState("0");
  // 자차 휘발유 가격 기준 기간(선택): 비우면 조회일의 전국 평균가
  const [fuelStart, setFuelStart] = useState("");
  const [fuelEnd, setFuelEnd] = useState("");
  // 오피넷이 날짜별 가격을 주는 범위(최근 7일 + 오늘)를 날짜 선택칸의 min/max로 안내한다.
  // 현재 시각은 서버에서 미리 만들 수 없는 값이라, 교통수단을 "자차"로 고르는 순간(브라우저)에 계산한다.
  const [fuelRange, setFuelRange] = useState<{ min: string; max: string } | null>(null);
  function ensureFuelRange() {
    const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    const now = new Date();
    setFuelRange((prev) => prev ?? { min: iso(new Date(now.getTime() - 7 * 86_400_000)), max: iso(now) });
  }
  // "기타" 과정: 교육생이 직접 입력하는 교육 장소·기간·숙소/식사 제공
  const [custom, setCustom] = useState<CustomCourseInput>(EMPTY_COURSE);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [meta, setMeta] = useState<ResultMeta | null>(null);

  // 계산에 실패해 입력 오류가 생기면 맨 위의 오류 칸으로 화면을 옮기고 그 칸에 커서를 둔다 (긴 입력 화면에서 오류를 못 찾는 일을 줄인다)
  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    const first = document.querySelector<HTMLElement>("[data-field-error]");
    if (!first) return;
    const target = first.dataset.errorFor ? document.getElementById(first.dataset.errorFor) : null;
    (target ?? first).scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus({ preventScroll: true });
  }, [errors]);

  const usesCar = outbound.transport === "car" || inbound.transport === "car";
  const customValid =
    custom.venueSido !== "" &&
    (SIGUNGU[custom.venueSido] ?? []).includes(custom.venueSigungu) &&
    custom.startDate !== "" &&
    custom.endDate >= custom.startDate;
  const course = customValid ? customToCourse(custom) : undefined;
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
        customCourse: custom,
        fuelPeriod: usesCar && (fuelStart || fuelEnd) ? { startDate: fuelStart, endDate: fuelEnd } : undefined,
        outbound: legPayload(outbound),
        inbound: legPayload(inboundValue),
        nights: nightsCount,
        mealDays: course?.mealsProvided ? undefined : Math.max(0, Number.parseInt(mealDays, 10) || 0),
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
        <h2 className="text-xl font-semibold tracking-tight">① 내 여비 계산하기</h2>

        <CourseFields value={custom} onChange={setCustom} errors={errors} />

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
          onChange={(p) => {
            setOutbound((v) => ({ ...v, ...p }));
            if (p.transport === "car") ensureFuelRange();
          }}
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
          onChange={(p) => {
            setInbound((v) => ({ ...v, ...p }));
            if (p.transport === "car") ensureFuelRange();
          }}
          placeLocked={sameReturn}
          errors={errors}
          errKey="inbound"
        />

        {usesCar && (
          <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <legend className="px-1 font-medium">휘발유 가격 기준 기간 (선택)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="fuel-start" label="시작일" error={errors["fuelPeriod.startDate"]}>
                <input
                  id="fuel-start"
                  type="date"
                  className={inputCls}
                  min={fuelRange?.min}
                  max={fuelRange?.max}
                  value={fuelStart}
                  onChange={(e) => {
                    setFuelStart(e.target.value);
                    if (fuelEnd && fuelEnd < e.target.value) setFuelEnd(e.target.value);
                  }}
                />
              </Field>
              <Field id="fuel-end" label="종료일" error={errors["fuelPeriod.endDate"]}>
                <input
                  id="fuel-end"
                  type="date"
                  className={inputCls}
                  min={fuelStart || fuelRange?.min}
                  max={fuelRange?.max}
                  value={fuelEnd}
                  onChange={(e) => setFuelEnd(e.target.value)}
                />
              </Field>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              비워 두면 오늘(조회일)의 전국 평균 휘발유 가격을 써요. 기간을 고르면 그 기간 중 오피넷이 제공하는 날짜별 전국 평균가를 평균해서 써요. 오피넷은 최근 7일과 오늘 가격만
              제공해서 그 밖의 날짜는 쓸 수 없고, 기간 안에 제공되는 날이 하나도 없으면 오늘 가격으로 계산하고 알려 드려요.
            </p>
            {(fuelStart || fuelEnd) && (
              <button
                type="button"
                className="text-xs underline"
                onClick={() => {
                  setFuelStart("");
                  setFuelEnd("");
                }}
              >
                기간 지우고 조회일 가격 쓰기
              </button>
            )}
          </fieldset>
        )}

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
                <p role="alert" data-field-error className={errCls}>
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

        {course &&
          (course.mealsProvided ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">이 과정은 식사를 제공해서 식비를 청구하지 않아요.</p>
          ) : (
            <Field id="mealDays" label={`식비 청구 일수 (0 ~ ${days}일, 기본 0)`} error={errors.mealDays}>
              <input
                id="mealDays"
                type="number"
                min={0}
                max={days}
                className={inputCls}
                value={mealDays}
                onChange={(e) => setMealDays(e.target.value)}
              />
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                식비는 교육에 포함되는 경우가 많아 기본으로 지급하지 않아요. 식사가 제공되지 않은 날이 있을 때만 그 일수를 입력하세요.
              </p>
            </Field>
          ))}

        <EvidenceUpload />

        <button
          type="submit"
          disabled={loading}
          className="lift w-full rounded-full bg-black px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
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
