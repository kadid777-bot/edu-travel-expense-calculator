// Design Ref: docs/SUBMISSION-DESIGN.md §7 — 운영자 비밀번호 로그인과 서명된 세션 쿠키
// 서버 전용: OPERATOR_PASSWORD, OPERATOR_SESSION_SECRET (둘 다 없으면 운영자 기능은 닫혀 있다)
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "op_session";
export const SESSION_HOURS = 8;

export function operatorEnabled(): boolean {
  return !!process.env.OPERATOR_PASSWORD && !!process.env.OPERATOR_SESSION_SECRET;
}

/** 비밀번호를 상수 시간으로 비교한다 (길이가 달라도 같은 시간) */
export function checkPassword(input: string): boolean {
  const expected = process.env.OPERATOR_PASSWORD;
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function sign(payload: string): string {
  const secret = process.env.OPERATOR_SESSION_SECRET ?? "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** 쿠키 값: {만료시각}.{서명} */
export function createSessionToken(now = Date.now()): string {
  const exp = String(now + SESSION_HOURS * 3600 * 1000);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): boolean {
  if (!token || !operatorEnabled()) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d{10,15}$/.test(exp) || Number(exp) < now) return false;
  const expected = sign(exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${SESSION_HOURS * 3600}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** API 라우트에서 쓰는 검사: 쿠키 헤더에서 세션 값을 꺼내 확인한다 */
export function isOperatorRequest(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return verifySessionToken(m?.[1]);
}
