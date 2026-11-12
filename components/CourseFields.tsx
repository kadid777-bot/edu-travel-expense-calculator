"use client";

// 교육 장소·기간·숙소/식사 제공을 교육생(운영자)이 직접 입력하는 칸.
// 자주 쓰는 교육 장소 3곳(캠코양재타워·캠코인재개발원(아산)·부산 본사(BIFC))을 고르면 시·도·시·군·구가 자동으로 채워진다.
import { useState } from "react";
import { SIDO_LIST, SIGUNGU } from "../data/sigungu";
import { VENUES, VENUE_OTHER } from "../data/venues";
import type { CustomCourseInput } from "../lib/calc/types";

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-700 dark:disabled:bg-zinc-800";
const labelCls = "mb-1 block text-sm font-medium";
const errCls = "mt-1 text-sm text-red-700 dark:text-red-400";

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

export const EMPTY_COURSE: CustomCourseInput = {
  venueSido: "",
  venueSigungu: "",
  startDate: "",
  endDate: "",
  lodgingProvided: false,
  mealsProvided: false,
};

export default function CourseFields({
  value,
  onChange,
  errors,
}: {
  value: CustomCourseInput;
  onChange: (next: CustomCourseInput) => void;
  errors: Record<string, string>;
}) {
  const [venueId, setVenueId] = useState("");
  const preset = VENUES.find((v) => v.id === venueId);
  const locked = preset !== undefined; // 3곳을 고르면 시·도·시·군·구는 자동으로 채워져 고칠 수 없다

  function pickVenue(id: string) {
    setVenueId(id);
    const v = VENUES.find((x) => x.id === id);
    if (v) onChange({ ...value, venueSido: v.sido, venueSigungu: v.sigungu });
    else if (id === VENUE_OTHER) onChange({ ...value, venueSido: "", venueSigungu: "" });
  }

  return (
    <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="px-1 font-medium">교육 장소와 기간</legend>

      <Field id="venue" label="교육 장소" error={errors["customCourse.venueSido"]}>
        <select id="venue" className={inputCls} value={venueId} onChange={(e) => pickVenue(e.target.value)}>
          <option value="">교육 장소를 선택하세요</option>
          {VENUES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
          <option value={VENUE_OTHER}>기타 (직접 입력)</option>
        </select>
      </Field>

      {preset && (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">
          <span className="text-zinc-500">주소 </span>
          {preset.address}
        </p>
      )}

      {venueId !== "" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="custom-sido" label="교육 장소 시·도" error={undefined}>
            <select
              id="custom-sido"
              className={inputCls}
              value={value.venueSido}
              disabled={locked}
              onChange={(e) => onChange({ ...value, venueSido: e.target.value, venueSigungu: "" })}
            >
              <option value="">선택</option>
              {SIDO_LIST.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field id="custom-sigungu" label="교육 장소 시·군·구" error={errors["customCourse.venueSigungu"]}>
            <select
              id="custom-sigungu"
              className={inputCls}
              value={value.venueSigungu}
              disabled={locked || value.venueSido === ""}
              onChange={(e) => onChange({ ...value, venueSigungu: e.target.value })}
            >
              <option value="">선택</option>
              {(SIGUNGU[value.venueSido] ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="custom-start" label="교육 시작일" error={errors["customCourse.startDate"]}>
          <input
            id="custom-start"
            type="date"
            className={inputCls}
            value={value.startDate}
            onChange={(e) =>
              onChange({ ...value, startDate: e.target.value, endDate: value.endDate < e.target.value ? e.target.value : value.endDate })
            }
          />
        </Field>
        <Field id="custom-end" label="교육 종료일" error={errors["customCourse.endDate"]}>
          <input
            id="custom-end"
            type="date"
            className={inputCls}
            min={value.startDate || undefined}
            value={value.endDate}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value.lodgingProvided} onChange={(e) => onChange({ ...value, lodgingProvided: e.target.checked })} />
          교육기관이 숙소를 제공해요 (숙박비 미지급)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value.mealsProvided} onChange={(e) => onChange({ ...value, mealsProvided: e.target.checked })} />
          교육기관이 식사를 제공해요 (식비 미지급)
        </label>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        자주 쓰는 교육 장소 3곳은 고르면 주소가 자동으로 채워져요. 그 밖의 장소는 &quot;기타&quot;를 고르고 시·도와 시·군·구를 직접 고르세요. 교육 일수는 시작일과 종료일을 모두
        포함해서 세고 최대 60일까지 입력할 수 있어요.
      </p>
    </fieldset>
  );
}
