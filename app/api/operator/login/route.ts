// Design Ref: docs/SUBMISSION-DESIGN.md §7 — 운영자 비밀번호 로그인 (10분 5회 제한, 상수 시간 비교, HttpOnly 세션 쿠키)
import { clientKey } from "../../../../lib/ai/rate-limit";
import { opError } from "../../../../lib/operator/guard";
import { checkPassword, createSessionToken, operatorEnabled, sessionCookie } from "../../../../lib/operator/session";
import { allowShared } from "../../../../lib/security/limiter";
import { checkRequest } from "../../../../lib/security/guard";

export async function POST(request: Request) {
  const blocked = checkRequest(request);
  if (blocked) return blocked;
  if (!operatorEnabled()) return opError(503, "NOT_CONFIGURED", "운영자 기능이 설정되지 않았습니다");
  if (!(await allowShared(`login:${clientKey(request)}`, 5, 600))) {
    return opError(429, "RATE_LIMITED", "로그인 시도가 너무 많습니다. 10분 뒤 다시 시도해 주세요");
  }
  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  } catch {
    return opError(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }
  if (!checkPassword(password)) return opError(401, "UNAUTHORIZED", "비밀번호가 맞지 않습니다");
  const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
  return new Response(JSON.stringify({ data: { ok: true } }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(createSessionToken(), secure), "Cache-Control": "no-store" },
  });
}
