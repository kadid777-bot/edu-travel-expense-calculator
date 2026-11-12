// Design Ref: docs/SUBMISSION-DESIGN.md §6 — 운영자: 제출 목록(GET)과 선택 삭제(DELETE)
import { z } from "zod";
import { opError, requireOperator } from "../../../../lib/operator/guard";
import { getStore, ID_PATTERN } from "../../../../lib/submissions/store";

export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;
  try {
    return Response.json({ data: { submissions: await getStore().list() } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[operator] list failed", e instanceof Error ? e.name : "unknown");
    return opError(500, "INTERNAL_ERROR", "목록을 불러오지 못했습니다");
  }
}

const deleteSchema = z.object({ ids: z.array(z.string().regex(ID_PATTERN)).min(1).max(200) });

export async function DELETE(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;
  let parsed;
  try {
    parsed = deleteSchema.safeParse(await request.json());
  } catch {
    return opError(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }
  if (!parsed.success) return opError(400, "VALIDATION_ERROR", "삭제할 제출을 선택해 주세요");
  try {
    const store = getStore();
    for (const id of parsed.data.ids) await store.remove(id); // 기록과 증빙 파일을 함께 지운다
    return Response.json({ data: { deleted: parsed.data.ids.length } });
  } catch (e) {
    console.error("[operator] delete failed", e instanceof Error ? e.name : "unknown");
    return opError(500, "INTERNAL_ERROR", "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요");
  }
}
