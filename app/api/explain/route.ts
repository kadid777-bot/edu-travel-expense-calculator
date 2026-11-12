// Design Ref: §4.2 POST /api/explain — 계산 결과를 쉬운 말로 설명 (금액은 바꾸지 않는다)
import { explainResult, resultSchema } from "../../../lib/ai/explain";
import { allowRequest, clientKey } from "../../../lib/ai/rate-limit";

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, details: {} } }, { status });
}

export async function POST(request: Request) {
  if (!allowRequest(`explain:${clientKey(request)}`)) {
    return error(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }

  const parsed = resultSchema.safeParse((body as { result?: unknown } | null)?.result);
  if (!parsed.success) return error(400, "VALIDATION_ERROR", "계산 결과 형식이 올바르지 않습니다");

  try {
    const { explanations, usedAi } = await explainResult(parsed.data);
    return Response.json({ data: { explanations, usedAi } });
  } catch {
    return error(500, "INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요");
  }
}
