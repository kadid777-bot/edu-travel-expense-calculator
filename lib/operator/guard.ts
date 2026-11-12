// 운영자 API 공통 검사: 로그인 세션 확인 (proxy가 막아 주지만, 라우트에서도 한 번 더 확인한다)
import { isOperatorRequest, operatorEnabled } from "./session";

export function requireOperator(request: Request): Response | null {
  if (!operatorEnabled()) {
    return Response.json({ error: { code: "NOT_CONFIGURED", message: "운영자 기능이 설정되지 않았습니다", details: {} } }, { status: 503 });
  }
  if (!isOperatorRequest(request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "운영자 로그인이 필요합니다", details: {} } }, { status: 401 });
  }
  return null;
}

export function opError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, details: {} } }, { status });
}
