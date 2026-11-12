// 제출 입력 검사 (서버·브라우저 공용)
import { z } from "zod";
import { ALLOWED_TYPES, FILE_KINDS, LIMITS, type FileKind } from "./types";

export const submitterSchema = z.object({
  name: z
    .string({ error: "이름을 입력해 주세요" })
    .trim()
    .min(1, "이름을 입력해 주세요")
    .max(30, "이름은 30자 이내로 입력해 주세요")
    .refine((s) => !/[\u0000-\u001f<>]/.test(s), "이름에 사용할 수 없는 문자가 있습니다"),
  employeeNo: z
    .string({ error: "사번을 입력해 주세요" })
    .trim()
    .regex(/^[A-Za-z0-9-]{2,20}$/, "사번은 영문·숫자·하이픈 2~20자로 입력해 주세요"),
});

export const createSchema = submitterSchema.extend({
  consent: z.literal(true, { error: "개인정보 수집·이용에 동의해 주세요" }),
  input: z.unknown(),
  result: z.unknown(),
  signature: z.string().max(200),
  meta: z
    .object({
      fetchedAt: z.string().max(40),
      notes: z.array(z.string().max(500)).max(30).default([]),
      evidence: z.unknown().optional(),
    })
    .default({ fetchedAt: "", notes: [] }),
});

export function isFileKind(v: unknown): v is FileKind {
  return typeof v === "string" && (FILE_KINDS as readonly string[]).includes(v);
}

/** 파일 하나가 제한 안인지 (형식·크기). 문제가 있으면 안내 문장을 돌려준다 */
export function checkFile(contentType: string, size: number): string | null {
  if (!Object.hasOwn(ALLOWED_TYPES, contentType)) return "사진(JPEG·PNG·WebP·HEIC)이나 PDF만 올릴 수 있어요";
  if (!Number.isFinite(size) || size <= 0) return "빈 파일은 올릴 수 없어요";
  if (size > LIMITS.maxFileBytes) return "파일은 하나에 10MB까지 올릴 수 있어요";
  return null;
}

/** 이미 올린 파일들에 새 파일을 더해도 개수·합계 제한 안인지 */
export function checkTotals(existing: { size: number }[], add: { size: number }): string | null {
  if (existing.length + 1 > LIMITS.maxFiles) return "증빙은 한 번에 10개까지 올릴 수 있어요";
  const total = existing.reduce((s, f) => s + f.size, 0) + add.size;
  if (total > LIMITS.maxTotalBytes) return "증빙 파일은 합계 30MB까지 올릴 수 있어요";
  return null;
}
