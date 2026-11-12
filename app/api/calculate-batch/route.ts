// Design Ref: §4.2 POST /api/calculate-batch — 운영자 일괄 산출 (한 번에 최대 25명, 서버에는 아무것도 저장하지 않는다)
// 이름은 받지 않는다: 행 번호(rowNo)만 받고 돌려준다.
import { z } from "zod";
import { clientKey } from "../../../lib/ai/rate-limit";
import { allowShared, allowSharedDaily } from "../../../lib/security/limiter";
import { calculateExpense } from "../../../lib/calc/calculate";
import { CHUNK_SIZE } from "../../../lib/calc/batch";
import { validateInput } from "../../../lib/calc/schema";
import { getLookups } from "../../../lib/external/lookups";
import { runLimited } from "../../../lib/external/http";
import { checkRequest } from "../../../lib/security/guard";

function error(status: number, code: string, message: string, details: object = {}) {
  return Response.json({ error: { code, message, details } }, { status });
}

const bodySchema = z.object({
  courseId: z.string().min(1).max(40),
  customCourse: z.unknown().optional(),
  rows: z.array(z.object({ rowNo: z.number().int().min(1).max(100000) }).passthrough()).min(1),
});

export async function POST(request: Request) {
  const blocked = checkRequest(request);
  if (blocked) return blocked;
  if (!(await allowShared(`batch:${clientKey(request)}`, 12, 600)) || !(await allowSharedDaily("batch", 400))) {
    return error(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return error(400, "VALIDATION_ERROR", "과정과 명단 형식이 올바르지 않습니다");
  if (parsed.data.rows.length > CHUNK_SIZE) {
    return error(400, "BATCH_TOO_LARGE", `한 번에 ${CHUNK_SIZE}명까지만 계산할 수 있습니다. 명단을 나눠서 보내 주세요`);
  }

  try {
    const { courseId } = parsed.data;
    const results = await runLimited(
      parsed.data.rows.map((row) => async () => {
        const { rowNo, ...rest } = row as { rowNo: number } & Record<string, unknown>;
        const checked = validateInput({ ...rest, courseId, customCourse: parsed.data.customCourse });
        if (!checked.ok) {
          return { rowNo, error: { message: checked.message, fieldErrors: checked.fieldErrors } };
        }
        const { lookups } = await getLookups(checked.data); // 같은 구간·날짜의 외부 조회는 캐시로 한 번만 한다
        return { rowNo, result: calculateExpense(checked.data, lookups) };
      }),
      8,
    );
    return Response.json({ data: { results } });
  } catch (e) {
    console.error("[calculate-batch] failed", e instanceof Error ? e.name : "unknown");
    return error(500, "INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요");
  }
}
