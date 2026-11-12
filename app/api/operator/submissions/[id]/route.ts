// Design Ref: docs/SUBMISSION-DESIGN.md §6 — 운영자: 제출 상세
import { opError, requireOperator } from "../../../../../lib/operator/guard";
import { getStore, ID_PATTERN } from "../../../../../lib/submissions/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireOperator(request);
  if (denied) return denied;
  const { id } = await params;
  if (!ID_PATTERN.test(id)) return opError(404, "NOT_FOUND", "제출을 찾을 수 없습니다");
  const sub = await getStore().get(id);
  if (!sub || sub.status !== "submitted") return opError(404, "NOT_FOUND", "제출을 찾을 수 없습니다");
  const { uploadKeyHash: _h, uploadKeyExpires: _e, ...safe } = sub;
  void _h;
  void _e;
  return Response.json({ data: safe }, { headers: { "Cache-Control": "no-store" } });
}
