// Design Ref: docs/SUBMISSION-DESIGN.md §6 — 제출 확정: 올라온 증빙을 확인하고 접수 번호를 확정한다
import { z } from "zod";
import { clientKey } from "../../../../../lib/ai/rate-limit";
import { allowShared } from "../../../../../lib/security/limiter";
import { checkRequest } from "../../../../../lib/security/guard";
import { attachBlobFiles, authorizeDraft, finalizeDraft } from "../../../../../lib/submissions/service";
import { getStore } from "../../../../../lib/submissions/store";

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, details: {} } }, { status });
}

const bodySchema = z.object({
  uploadKey: z.string().max(100),
  files: z
    .array(z.object({ fileId: z.string().max(40), kind: z.string().max(20), name: z.string().max(200), contentType: z.string().max(60) }))
    .max(20)
    .default([]),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = checkRequest(request);
  if (blocked) return blocked;
  if (!(await allowShared(`finalize:${clientKey(request)}`, 20, 600))) return error(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요");
  const { id } = await params;

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return error(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }
  if (!parsed.success) return error(400, "VALIDATION_ERROR", "요청 내용을 확인해 주세요");

  try {
    const auth = await authorizeDraft(id, parsed.data.uploadKey);
    if (!auth.ok) return error(auth.status, auth.code, auth.message);
    if (getStore().mode === "vercel" && parsed.data.files.length > 0) {
      const att = await attachBlobFiles(auth.sub, parsed.data.files);
      if (!att.ok) return error(att.status, att.code, att.message);
    }
    const done = await finalizeDraft(auth.sub);
    return Response.json({ data: { id: done.id, files: auth.sub.files.length } });
  } catch (e) {
    console.error("[submissions] finalize failed", e instanceof Error ? e.name : "unknown");
    return error(500, "INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요");
  }
}
