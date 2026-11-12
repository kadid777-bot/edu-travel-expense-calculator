// Design Ref: docs/SUBMISSION-DESIGN.md §6 POST /api/submissions — 제출 초안 만들기 (이름·사번·동의·계산 입력·서명된 결과 확인)
import { clientKey } from "../../../lib/ai/rate-limit";
import { allowShared, allowSharedDaily } from "../../../lib/security/limiter";
import { checkRequest } from "../../../lib/security/guard";
import { createDraft } from "../../../lib/submissions/service";
import { getStore } from "../../../lib/submissions/store";
import { LIMITS } from "../../../lib/submissions/types";

function error(status: number, code: string, message: string, details: object = {}) {
  return Response.json({ error: { code, message, details } }, { status });
}

export async function POST(request: Request) {
  const blocked = checkRequest(request);
  if (blocked) return blocked;
  if (!(await allowShared(`submit:${clientKey(request)}`, 8, 600)) || !(await allowSharedDaily("submit", 2000))) {
    return error(429, "RATE_LIMITED", "제출 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }
  try {
    const r = await createDraft(body);
    if (!r.ok) return error(r.status, r.code, r.message, r.fieldErrors ? { fieldErrors: r.fieldErrors } : {});
    return Response.json({
      data: {
        id: r.id,
        uploadKey: r.uploadKey,
        expiresAt: r.expiresAt,
        // Vercel 저장소에서는 브라우저가 파일을 저장소로 바로 올리고, 로컬·시험에서는 서버를 거쳐 올린다
        uploadMode: getStore().mode === "vercel" ? "blob" : "server",
        limits: LIMITS,
      },
    });
  } catch (e) {
    console.error("[submissions] create failed", e instanceof Error ? e.name : "unknown");
    return error(500, "INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요");
  }
}
