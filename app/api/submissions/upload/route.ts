// Design Ref: docs/SUBMISSION-DESIGN.md §6 POST /api/submissions/upload — 브라우저가 증빙 파일을 Vercel Blob에 바로 올리도록 승인(토큰 발급)
// 서버는 접수 번호·업로드 키·파일 형식·크기·경로를 확인한 토큰만 발급한다. 파일 자체는 서버를 거치지 않는다.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { clientKey } from "../../../../lib/ai/rate-limit";
import { allowShared } from "../../../../lib/security/limiter";
import { checkRequest } from "../../../../lib/security/guard";
import { authorizeDraft, blobPathFor } from "../../../../lib/submissions/service";
import { getStore } from "../../../../lib/submissions/store";
import { ALLOWED_TYPES, LIMITS } from "../../../../lib/submissions/types";
import { checkFile, checkTotals, isFileKind } from "../../../../lib/submissions/validate";

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, details: {} } }, { status });
}

export async function POST(request: Request) {
  const blocked = checkRequest(request);
  if (blocked) return blocked;
  if (getStore().mode !== "vercel") return error(404, "NOT_FOUND", "이 환경에서는 사용하지 않는 주소입니다");
  if (!(await allowShared(`upload:${clientKey(request)}`, 60, 600))) return error(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요");

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return error(400, "VALIDATION_ERROR", "요청 내용을 읽을 수 없습니다");
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let p: { id?: string; key?: string; kind?: string; contentType?: string; size?: number };
        try {
          p = JSON.parse(clientPayload ?? "{}");
        } catch {
          throw new Error("요청을 확인할 수 없습니다");
        }
        const auth = await authorizeDraft(String(p.id ?? ""), p.key);
        if (!auth.ok) throw new Error(auth.message);
        if (!isFileKind(p.kind)) throw new Error("증빙 종류를 선택해 주세요");
        const type = String(p.contentType ?? "");
        const size = Number(p.size);
        const bad = checkFile(type, size);
        if (bad) throw new Error(bad);
        const over = checkTotals(auth.sub.files, { size });
        if (over) throw new Error(over);
        // 경로는 서버가 정한 모양(submissions/{접수번호}/{무작위16자}.{확장자})만 허용한다
        const m = pathname.match(/^submissions\/([A-Z2-9]{4}-[A-Z2-9]{4})\/([a-f0-9]{16})\.([a-z]+)$/);
        if (!m || m[1] !== auth.sub.id || pathname !== blobPathFor(auth.sub.id, m[2], type)) throw new Error("파일 경로가 올바르지 않습니다");
        return {
          allowedContentTypes: [type],
          maximumSizeInBytes: Math.min(size, LIMITS.maxFileBytes),
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ id: auth.sub.id }),
        };
      },
      // 업로드 완료 알림은 쓰지 않는다: 확정 단계에서 실제로 저장된 파일을 직접 확인한다
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (e) {
    return error(400, "UPLOAD_REJECTED", e instanceof Error ? e.message : "업로드를 승인할 수 없습니다");
  }
}

// 사용하지 않는 import 경고 방지: 허용 형식 표는 클라이언트 안내에 쓰인다
void ALLOWED_TYPES;
