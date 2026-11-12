// 공개 서버용 입구 검사 — 다른 사이트가 우리 API를 몰래 부르는 것을 막고, 계산 결과에 서명을 붙인다.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function reject(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, details: {} } }, { status });
}

/** JSON 요청만 받고, 다른 사이트(cross-site)에서 온 요청은 거절한다. 통과하면 null */
export function checkRequest(request: Request): Response | null {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    return reject(415, "UNSUPPORTED_MEDIA_TYPE", "JSON 형식의 요청만 받을 수 있습니다");
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return reject(403, "FORBIDDEN", "허용되지 않은 요청입니다");
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* 잘못된 Origin은 아래에서 거절 */
    }
    if (originHost !== host) return reject(403, "FORBIDDEN", "허용되지 않은 요청입니다");
  }
  return null;
}

/** 서명 비밀값 (서버 전용). 전용 값이 없으면 OpenAI 키에서 파생하고, 둘 다 없으면 개발용 고정값 */
function secret(): string {
  const base = process.env.RESULT_SIGNING_SECRET || process.env.OPENAI_API_KEY || "dev-only-signing-secret";
  return createHash("sha256").update(`result-signing:${base}`).digest("hex");
}

/** 계산 결과 JSON에 붙이는 서명. /api/explain은 서버가 만든 결과만 받는다 */
export function signResult(result: unknown): string {
  return createHmac("sha256", secret()).update(JSON.stringify(result)).digest("hex");
}

export function verifyResult(result: unknown, signature: unknown): boolean {
  if (typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(signResult(result), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
