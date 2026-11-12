// Design Ref: docs/SUBMISSION-DESIGN.md §7 — 운영자 화면과 운영자 API는 로그인(세션 쿠키)이 있어야 열린다
// (Next.js 16의 proxy: 요청이 화면·API에 닿기 전에 실행된다)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/operator/session";

const OPEN_PATHS = ["/operator/login", "/api/operator/login", "/api/operator/logout"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN_PATHS.includes(pathname)) return NextResponse.next();

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "운영자 로그인이 필요합니다", details: {} } }, { status: 401 });
  }
  const url = new URL("/operator/login", request.url);
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/operator/:path*", "/api/operator/:path*", "/api/calculate-batch"],
};
