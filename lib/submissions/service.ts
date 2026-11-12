// Design Ref: docs/SUBMISSION-DESIGN.md §6 — 제출 만들기·파일 더하기·확정 (라우트에서 부르는 논리, 테스트하기 쉽게 분리)
import { randomBytes, timingSafeEqual } from "node:crypto";
import { calculationInputSchema, validateInput } from "../calc/schema";
import type { CalculationInput, CalculationResult } from "../calc/types";
import { verifyResult } from "../security/guard";
import { getStore, hashKey, newSubmissionId, newUploadKey, ID_PATTERN } from "./store";
import {
  ALLOWED_TYPES,
  CONSENT_VERSION,
  LIMITS,
  type FileKind,
  type Submission,
  type SubmissionFile,
} from "./types";
import { checkFile, checkTotals, createSchema, isFileKind } from "./validate";

export type Failure = { ok: false; status: number; code: string; message: string; fieldErrors?: Record<string, string> };
const fail = (status: number, code: string, message: string, fieldErrors?: Record<string, string>): Failure => ({
  ok: false,
  status,
  code,
  message,
  fieldErrors,
});

const MAX_JSON_BYTES = 200_000; // 조회 근거(경로선 포함)까지 담아도 이 정도면 충분하다

/** 제출 초안을 만든다: 입력·결과 서명·동의·이름·사번을 확인하고 접수 번호와 업로드 키를 준다 */
export async function createDraft(
  raw: unknown,
  now = new Date(),
): Promise<Failure | { ok: true; id: string; uploadKey: string; expiresAt: string }> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path.join(".");
      if (!(k in fieldErrors)) fieldErrors[k] = i.message;
    }
    return fail(400, "VALIDATION_ERROR", Object.values(fieldErrors)[0] ?? "입력을 확인해 주세요", fieldErrors);
  }
  const { name, employeeNo, input, result, signature, meta } = parsed.data;

  const checked = validateInput(input);
  if (!checked.ok) return fail(400, "VALIDATION_ERROR", "계산 입력을 다시 확인해 주세요", checked.fieldErrors);
  // 서버가 /api/calculate에서 서명한 결과만 받는다(금액 조작 방지)
  if (!verifyResult(result, signature)) return fail(400, "VALIDATION_ERROR", "계산 결과를 다시 확인해 주세요. 계산을 새로 실행해 주세요");
  if (JSON.stringify({ result, meta }).length > MAX_JSON_BYTES) return fail(400, "VALIDATION_ERROR", "제출 내용이 너무 큽니다");
  if (!checked.data.customCourse) return fail(400, "VALIDATION_ERROR", "교육 장소와 기간을 입력한 계산만 제출할 수 있어요");

  const id = newSubmissionId();
  const uploadKey = newUploadKey();
  const expires = new Date(now.getTime() + LIMITS.uploadKeyMinutes * 60_000);
  const sub: Submission = {
    id,
    createdAt: now.toISOString(),
    status: "draft",
    submitter: { name, employeeNo },
    consent: { agreedAt: now.toISOString(), version: CONSENT_VERSION },
    input: checked.data as CalculationInput,
    result: result as CalculationResult,
    meta: { fetchedAt: meta.fetchedAt, notes: meta.notes, evidence: meta.evidence },
    files: [],
    uploadKeyHash: hashKey(uploadKey),
    uploadKeyExpires: expires.toISOString(),
  };
  await getStore().create(sub);
  return { ok: true, id, uploadKey, expiresAt: expires.toISOString() };
}

/** 접수 번호와 업로드 키가 맞는 초안을 꺼낸다 */
export async function authorizeDraft(id: string, key: unknown, now = new Date()): Promise<Failure | { ok: true; sub: Submission }> {
  if (!ID_PATTERN.test(id) || typeof key !== "string" || key.length < 20 || key.length > 100) {
    return fail(403, "FORBIDDEN", "제출을 확인할 수 없습니다");
  }
  const sub = await getStore().get(id);
  if (!sub || sub.status !== "draft" || !sub.uploadKeyHash || !sub.uploadKeyExpires) return fail(403, "FORBIDDEN", "제출을 확인할 수 없습니다");
  const given = Buffer.from(hashKey(key));
  const want = Buffer.from(sub.uploadKeyHash);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return fail(403, "FORBIDDEN", "제출을 확인할 수 없습니다");
  if (Date.parse(sub.uploadKeyExpires) < now.getTime()) return fail(403, "EXPIRED", "제출 시간이 지났습니다. 처음부터 다시 제출해 주세요");
  return { ok: true, sub };
}

export function blobPathFor(id: string, fileId: string, contentType: string): string {
  return `submissions/${id}/${fileId}.${ALLOWED_TYPES[contentType]}`;
}

export function newFileId(): string {
  return randomBytes(8).toString("hex");
}

/** 파일 이름은 표시용으로만 쓴다: 경로 구분·제어 문자를 지우고 길이를 줄인다 */
export function cleanFileName(name: string): string {
  return name.replace(/[\u0000-\u001f\\/<>:"|?*]/g, "_").slice(0, 120) || "파일";
}

/** 서버를 거쳐 올린 파일(4MB 이하)을 저장하고 초안에 더한다 */
export async function addServerFile(
  id: string,
  key: unknown,
  kind: unknown,
  file: { name: string; type: string; data: Uint8Array },
): Promise<Failure | { ok: true; file: SubmissionFile }> {
  const auth = await authorizeDraft(id, key);
  if (!auth.ok) return auth;
  if (!isFileKind(kind)) return fail(400, "VALIDATION_ERROR", "증빙 종류를 선택해 주세요");
  const bad = checkFile(file.type, file.data.byteLength);
  if (bad) return fail(400, "VALIDATION_ERROR", bad);
  if (file.data.byteLength > LIMITS.serverUploadBytes) return fail(413, "TOO_LARGE", "이 방식은 4MB까지만 올릴 수 있어요");
  const over = checkTotals(auth.sub.files, { size: file.data.byteLength });
  if (over) return fail(400, "VALIDATION_ERROR", over);
  if (!hasMagic(file.type, file.data)) return fail(400, "VALIDATION_ERROR", "파일 내용이 선택한 형식과 달라요");

  const fileId = newFileId();
  const blobPath = blobPathFor(id, fileId, file.type);
  await getStore().putFile(blobPath, file.data, file.type);
  const rec: SubmissionFile = { id: fileId, kind: kind as FileKind, name: cleanFileName(file.name), size: file.data.byteLength, contentType: file.type, blobPath };
  auth.sub.files.push(rec);
  await getStore().save(auth.sub);
  return { ok: true, file: rec };
}

/** 파일 앞부분(매직 넘버)이 선언한 형식과 맞는지: 확장자만 바꾼 실행 파일 등을 거른다 */
export function hasMagic(type: string, d: Uint8Array): boolean {
  const eq = (offset: number, bytes: number[]) => bytes.every((b, i) => d[offset + i] === b);
  switch (type) {
    case "image/jpeg":
      return eq(0, [0xff, 0xd8, 0xff]);
    case "image/png":
      return eq(0, [0x89, 0x50, 0x4e, 0x47]);
    case "image/webp":
      return eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x45, 0x42, 0x50]);
    case "application/pdf":
      return eq(0, [0x25, 0x50, 0x44, 0x46]);
    case "image/heic":
      return d.length > 12 && eq(4, [0x66, 0x74, 0x79, 0x70]); // 'ftyp'
    default:
      return false;
  }
}

/** Blob에 직접 올린 파일들을 확인해 초안에 더한다 (브라우저가 알려 준 목록을 믿지 않고 실제 저장된 파일을 확인) */
export async function attachBlobFiles(
  sub: Submission,
  declared: { fileId: string; kind: unknown; name: string; contentType: string }[],
): Promise<Failure | { ok: true }> {
  const store = getStore();
  for (const d of declared) {
    if (!isFileKind(d.kind) || !/^[a-f0-9]{16}$/.test(d.fileId) || !Object.hasOwn(ALLOWED_TYPES, d.contentType)) {
      return fail(400, "VALIDATION_ERROR", "증빙 정보를 확인해 주세요");
    }
    if (sub.files.some((f) => f.id === d.fileId)) continue;
    const blobPath = blobPathFor(sub.id, d.fileId, d.contentType);
    const h = await store.headFile(blobPath);
    if (!h) return fail(400, "VALIDATION_ERROR", `올라가지 않은 파일이 있어요: ${cleanFileName(d.name)}`);
    const bad = checkFile(h.contentType.split(";")[0].trim() || d.contentType, h.size);
    if (bad) return fail(400, "VALIDATION_ERROR", bad);
    const over = checkTotals(sub.files, { size: h.size });
    if (over) return fail(400, "VALIDATION_ERROR", over);
    sub.files.push({ id: d.fileId, kind: d.kind, name: cleanFileName(d.name), size: h.size, contentType: d.contentType, blobPath });
  }
  return { ok: true };
}

/** 제출을 확정한다 */
export async function finalizeDraft(sub: Submission): Promise<{ ok: true; id: string }> {
  sub.status = "submitted";
  delete sub.uploadKeyHash;
  delete sub.uploadKeyExpires;
  await getStore().save(sub);
  return { ok: true, id: sub.id };
}

// 편의: 입력 스키마를 밖에서 재사용할 수 있게 내보낸다
export { calculationInputSchema };
