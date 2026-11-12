// Design Ref: docs/SUBMISSION-DESIGN.md §8 — 운영자: 선택한 제출을 지금 요금으로 다시 산출해 제출값과 비교 (한 번에 25건까지)
import { z } from "zod";
import { calculateExpense } from "../../../../lib/calc/calculate";
import { getLookups } from "../../../../lib/external/lookups";
import { runLimited } from "../../../../lib/external/http";
import { opError, requireOperator } from "../../../../lib/operator/guard";
import { checkRequest } from "../../../../lib/security/guard";
import { getStore, ID_PATTERN } from "../../../../lib/submissions/store";

const bodySchema = z.object({ ids: z.array(z.string().regex(ID_PATTERN)).min(1).max(25) });

export async function POST(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;
  const blocked = checkRequest(request);
  if (blocked) return blocked;
  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return opError(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }
  if (!parsed.success) return opError(400, "VALIDATION_ERROR", "다시 계산할 제출을 25건 이내로 선택해 주세요");

  try {
    const store = getStore();
    const rows = await runLimited(
      parsed.data.ids.map((id) => async () => {
        const sub = await store.get(id);
        if (!sub || sub.status !== "submitted") return { id, error: "제출을 찾을 수 없습니다" };
        const { lookups } = await getLookups(sub.input);
        const now = calculateExpense(sub.input, lookups);
        const diffs = now.items
          .map((it, i) => ({ category: it.category, submitted: sub.result.items[i]?.approved ?? 0, now: it.approved }))
          .filter((d) => d.submitted !== d.now);
        return { id, name: sub.submitter.name, submittedTotal: sub.result.total, nowTotal: now.total, diffs, warnings: now.warnings };
      }),
      8,
    );
    return Response.json({ data: { results: rows } });
  } catch (e) {
    console.error("[operator] recalculate failed", e instanceof Error ? e.name : "unknown");
    return opError(500, "INTERNAL_ERROR", "다시 계산하지 못했습니다");
  }
}
