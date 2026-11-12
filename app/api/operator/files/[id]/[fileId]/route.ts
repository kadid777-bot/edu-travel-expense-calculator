// Design Ref: docs/SUBMISSION-DESIGN.md §6 — 운영자: 증빙 파일 내려주기 (서버가 저장소에서 읽어 전달, 저장소 주소는 노출하지 않는다)
import { opError, requireOperator } from "../../../../../../lib/operator/guard";
import { getStore, ID_PATTERN } from "../../../../../../lib/submissions/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const denied = requireOperator(request);
  if (denied) return denied;
  const { id, fileId } = await params;
  if (!ID_PATTERN.test(id) || !/^[a-f0-9]{16}$/.test(fileId)) return opError(404, "NOT_FOUND", "파일을 찾을 수 없습니다");
  const store = getStore();
  const sub = await store.get(id);
  const rec = sub?.status === "submitted" ? sub.files.find((f) => f.id === fileId) : undefined;
  if (!sub || !rec) return opError(404, "NOT_FOUND", "파일을 찾을 수 없습니다");
  const blob = await store.readFile(rec.blobPath);
  if (!blob) return opError(404, "NOT_FOUND", "파일을 찾을 수 없습니다");

  const download = new URL(request.url).searchParams.get("download") === "1";
  const ext = rec.blobPath.split(".").pop();
  const safeName = encodeURIComponent(`${sub.id}_${rec.kind}_${rec.id.slice(0, 6)}.${ext}`);
  return new Response(blob.body as BodyInit, {
    headers: {
      "Content-Type": rec.contentType, // 기록에 남긴 형식(허용 목록)만 쓴다
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${safeName}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
