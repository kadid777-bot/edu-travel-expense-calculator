// Design Ref: docs/SUBMISSION-DESIGN.md §8 — 운영자: 선택한 제출의 산출 내역 CSV
import { opError, requireOperator } from "../../../../lib/operator/guard";
import { submissionsToCsv } from "../../../../lib/submissions/export";
import { getStore, ID_PATTERN } from "../../../../lib/submissions/store";

export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 500);
  if (ids.length === 0 || ids.some((i) => !ID_PATTERN.test(i))) return opError(400, "VALIDATION_ERROR", "내려받을 제출을 선택해 주세요");
  const store = getStore();
  const list = [];
  for (const id of ids) {
    const s = await store.get(id);
    if (s && s.status === "submitted") list.push(s);
  }
  return new Response(submissionsToCsv(list), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("교육여비_제출내역.csv")}`,
      "Cache-Control": "private, no-store",
    },
  });
}
