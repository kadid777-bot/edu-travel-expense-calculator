// Design Ref: §4.2 POST /api/ask — 규정 AI 질의응답 (질문 → 관련 조항 검색 → AI 답변 → 규칙 검증)
// 보안: OpenAI 키는 서버에서만 쓰고, 질문 내용은 저장·로그하지 않는다.
import { askRegulation } from "../../../lib/ai/ask";
import { checkRequest } from "../../../lib/security/guard";
import { allowDaily, allowRequest, clientKey } from "../../../lib/ai/rate-limit";

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, details: {} } }, { status });
}

export async function POST(request: Request) {
  const blocked = checkRequest(request);
  if (blocked) return blocked;
  if (!allowDaily("openai", 1500)) {
    return error(429, "RATE_LIMITED", "오늘 AI 질문 가능 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요");
  }
  if (!allowRequest(`ask:${clientKey(request)}`)) {
    return error(429, "RATE_LIMITED", "질문이 너무 많습니다. 잠시 후 다시 시도해 주세요");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }

  try {
    const outcome = await askRegulation((body as { question?: unknown } | null)?.question);
    if (outcome.status === "invalid") return error(400, "VALIDATION_ERROR", outcome.message);
    if (outcome.status === "ai_unavailable") {
      return error(502, "AI_UNAVAILABLE", "AI 답변을 지금 받을 수 없습니다. 잠시 후 다시 시도해 주세요.");
    }
    return Response.json({ data: outcome.data });
  } catch (e) {
    console.error("[ask] failed", e instanceof Error ? e.name : "unknown");
    return error(500, "INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요");
  }
}
