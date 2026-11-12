// Design Ref: §4.2 POST /api/calculate — 여비 산출 (입력 검사 → 외부 조회 → 계산 엔진)
// 보안: 외부 API 키는 서버(lib/external)에서만 쓰고, 입력값은 저장하지 않는다.
import { getCourse } from "../../../data/courses";
import { calculateExpense } from "../../../lib/calc/calculate";
import { validateInput } from "../../../lib/calc/schema";
import { allowDaily, allowRequest, clientKey } from "../../../lib/ai/rate-limit";
import { checkRequest, signResult } from "../../../lib/security/guard";
import { getLookups } from "../../../lib/external/lookups";

function error(status: number, code: string, message: string, details: object = {}) {
  return Response.json({ error: { code, message, details } }, { status });
}

export async function POST(request: Request) {
  const blocked = checkRequest(request);
  if (blocked) return blocked;
  if (!allowRequest(`calculate:${clientKey(request)}`, 60) || !allowDaily("calculate", 5000)) {
    return error(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }

  // courseId가 없으면 400(검사에서 처리), 목록에 없는 과정이면 404
  const courseId = (body as { courseId?: unknown } | null)?.courseId;
  if (typeof courseId === "string" && courseId !== "" && !getCourse(courseId)) {
    return error(404, "COURSE_NOT_FOUND", "교육 과정을 다시 선택해 주세요", { fieldErrors: { courseId: "교육 과정을 다시 선택해 주세요" } });
  }

  const checked = validateInput(body);
  if (!checked.ok) {
    return error(400, "VALIDATION_ERROR", checked.message, { fieldErrors: checked.fieldErrors });
  }

  try {
    const { lookups, mock, fetchedAt, notes } = await getLookups(checked.data);
    const result = calculateExpense(checked.data, lookups);
    return Response.json({ data: result, meta: { mockLookups: mock, fetchedAt, notes, signature: signResult(result) } });
  } catch (e) {
    console.error("[calculate] failed", e);
    return error(500, "INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요");
  }
}
