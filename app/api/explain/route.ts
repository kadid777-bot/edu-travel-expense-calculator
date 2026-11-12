// Design Ref: §4.2 POST /api/explain — 계산 결과를 쉬운 말로 설명 (금액은 바꾸지 않는다)
import { explainResult, resultSchema } from "../../../lib/ai/explain";
import { checkRequest, verifyResult } from "../../../lib/security/guard";
import { allowDaily, allowRequest, clientKey } from "../../../lib/ai/rate-limit";

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, details: {} } }, { status });
}

export async function POST(request: Request) {
  const blocked = checkRequest(request);
  if (blocked) return blocked;
  if (!allowDaily("openai", 1500)) {
    return error(429, "RATE_LIMITED", "오늘 AI 설명 가능 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요");
  }
  if (!allowRequest(`explain:${clientKey(request)}`)) {
    return error(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }

  const { result, signature } = (body ?? {}) as { result?: unknown; signature?: unknown };
  // 서버가 /api/calculate에서 서명한 결과만 설명한다(조작된 결과·자유 문장이 AI로 가는 것을 막는다)
  if (!verifyResult(result, signature)) return error(400, "VALIDATION_ERROR", "계산 결과를 다시 확인해 주세요. 계산을 새로 실행해 주세요");
  const parsed = resultSchema.safeParse(result);
  if (!parsed.success) return error(400, "VALIDATION_ERROR", "계산 결과 형식이 올바르지 않습니다");

  try {
    const { explanations, usedAi } = await explainResult(parsed.data);
    return Response.json({ data: { explanations, usedAi } });
  } catch (e) {
    console.error("[explain] failed", e instanceof Error ? e.name : "unknown");
    return error(500, "INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요");
  }
}
