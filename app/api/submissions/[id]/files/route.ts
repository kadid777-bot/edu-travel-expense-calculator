// Design Ref: docs/SUBMISSION-DESIGN.md §6 — 서버를 거쳐 증빙 파일 올리기 (로컬·시험, 또는 4MB 이하 파일)
import { clientKey } from "../../../../../lib/ai/rate-limit";
import { allowShared } from "../../../../../lib/security/limiter";
import { addServerFile } from "../../../../../lib/submissions/service";
import { checkRequestAny } from "../../../../../lib/security/guard";

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, details: {} } }, { status });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = checkRequestAny(request, "multipart/form-data");
  if (blocked) return blocked;
  if (!(await allowShared(`upload:${clientKey(request)}`, 60, 600))) return error(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요");
  const { id } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return error(400, "VALIDATION_ERROR", "파일을 선택해 주세요");
  if (file.size > 4 * 1024 * 1024 + 1024) return error(413, "TOO_LARGE", "이 방식은 4MB까지만 올릴 수 있어요");
  try {
    const r = await addServerFile(id, form.get("uploadKey"), form.get("kind"), {
      name: file.name,
      type: file.type,
      data: new Uint8Array(await file.arrayBuffer()),
    });
    if (!r.ok) return error(r.status, r.code, r.message);
    return Response.json({ data: { fileId: r.file.id, name: r.file.name, size: r.file.size } });
  } catch (e) {
    console.error("[submissions] file failed", e instanceof Error ? e.name : "unknown");
    return error(500, "INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요");
  }
}
