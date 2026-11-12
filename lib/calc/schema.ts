// Design Ref: §2.2 처리 1 — 입력 검사 (필수값이 비면 계산하지 않고 입력을 요청한다)
// Plan SC: PRD §5 ① 필수 입력값 / FR-01, FR-18
import { z } from "zod";
import { COURSES } from "../../data/courses";
import { RULES } from "../../data/rules";
import { SIGUNGU } from "../../data/sigungu";
import { countDays } from "./days";
import type { CalculationInput } from "./types";

const money = z
  .number({ error: "금액을 숫자(원)로 입력해 주세요" })
  .int("금액은 원 단위 정수로 입력해 주세요")
  .min(0, "금액은 0 이상이어야 합니다")
  .max(100_000_000, "금액이 너무 큽니다");

const legSchema = z.object({
  sido: z.string({ error: "시·도를 선택해 주세요" }).min(1, "시·도를 선택해 주세요"),
  sigungu: z.string({ error: "시·군·구를 선택해 주세요" }).min(1, "시·군·구를 선택해 주세요"),
  transport: z.enum(["train", "air", "bus", "car"], { error: "교통수단을 선택해 주세요" }),
  transportActual: money.optional(),
  tollActual: money.optional(),
});

const baseSchema = z.object({
  courseId: z.string({ error: "교육 과정을 선택해 주세요" }).min(1, "교육 과정을 선택해 주세요"),
  outbound: legSchema,
  inbound: legSchema,
  nights: z
    .number({ error: "숙박 박수를 숫자로 입력해 주세요" })
    .int("숙박 박수는 정수로 입력해 주세요")
    .min(0, "숙박 박수는 0 이상이어야 합니다")
    .max(60, "숙박 박수가 너무 큽니다"),
  lodgingActuals: z.array(money).max(61).optional(),
});

export const calculationInputSchema = baseSchema.superRefine((v, ctx) => {
  const course = COURSES.find((c) => c.id === v.courseId);
  if (!course) {
    ctx.addIssue({ code: "custom", path: ["courseId"], message: "교육 과정을 다시 선택해 주세요" });
    return;
  }

  for (const key of ["outbound", "inbound"] as const) {
    const leg = v[key];
    const place = key === "outbound" ? "출발지" : "귀가지";
    const sigunguList = Object.hasOwn(SIGUNGU, leg.sido) ? SIGUNGU[leg.sido] : undefined;
    if (!sigunguList) {
      ctx.addIssue({ code: "custom", path: [key, "sido"], message: `${place} 시·도를 목록에서 선택해 주세요` });
    } else if (!sigunguList.includes(leg.sigungu)) {
      ctx.addIssue({ code: "custom", path: [key, "sigungu"], message: `${place} 시·군·구를 목록에서 선택해 주세요` });
    }
    // 기차·버스·항공은 교통비 실비가 필수, 자차는 하이패스 실비만 선택 입력
    if (leg.transport !== "car" && leg.transportActual === undefined) {
      ctx.addIssue({ code: "custom", path: [key, "transportActual"], message: "교통비 실비를 입력해 주세요" });
    }
  }

  // FR-18: 숙박 박수는 0 이상, (교육 일수 − 1 + 전일 숙박 허용 박수) 이하
  const days = countDays(course.startDate, course.endDate);
  const maxNights = Math.max(0, days - 1 + RULES.extraNightsAllowed);
  if (v.nights > maxNights) {
    ctx.addIssue({
      code: "custom",
      path: ["nights"],
      message: `숙박 박수는 ${maxNights}박 이하여야 합니다 (교육 ${days}일)`,
    });
  }

  // 숙소를 제공하는 과정이 아니면 박별 숙박비 실비가 박수만큼 필요
  if (!course.lodgingProvided && v.lodgingActuals && v.lodgingActuals.length > v.nights) {
    ctx.addIssue({ code: "custom", path: ["lodgingActuals"], message: `박별 숙박비 실비는 ${v.nights}박만큼만 입력해 주세요` });
  }
  if (!course.lodgingProvided && v.nights > 0) {
    const actuals = v.lodgingActuals;
    if (!actuals || actuals.length !== v.nights) {
      ctx.addIssue({
        code: "custom",
        path: ["lodgingActuals"],
        message: `박별 숙박비 실비를 ${v.nights}박만큼 모두 입력해 주세요`,
      });
    }
  }
});

export type FieldErrors = Record<string, string>;

export type ValidationResult =
  | { ok: true; data: CalculationInput }
  | { ok: false; fieldErrors: FieldErrors; message: string };

/** 입력을 검사한다. 실패하면 칸별 오류 메시지(fieldErrors)를 돌려준다 */
export function validateInput(raw: unknown): ValidationResult {
  const parsed = calculationInputSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, data: parsed.data as CalculationInput };
  }
  const fieldErrors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".");
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  const first = Object.values(fieldErrors)[0] ?? "입력값을 확인해 주세요";
  return { ok: false, fieldErrors, message: first };
}
