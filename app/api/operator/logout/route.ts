import { clearCookie } from "../../../../lib/operator/session";

export async function POST(request: Request) {
  const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
  return new Response(JSON.stringify({ data: { ok: true } }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": clearCookie(secure), "Cache-Control": "no-store" },
  });
}
