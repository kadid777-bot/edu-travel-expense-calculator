import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createPost } from "../app/api/submissions/route";
import { POST as filesPost } from "../app/api/submissions/[id]/files/route";
import { POST as finalizePost } from "../app/api/submissions/[id]/finalize/route";
import { GET as listGet, DELETE as listDelete } from "../app/api/operator/submissions/route";
import { GET as detailGet } from "../app/api/operator/submissions/[id]/route";
import { GET as fileGet } from "../app/api/operator/files/[id]/[fileId]/route";
import { GET as exportGet } from "../app/api/operator/export/route";
import { POST as loginPost } from "../app/api/operator/login/route";
import { calculateExpense } from "../lib/calc/calculate";
import { resetRateLimit } from "../lib/ai/rate-limit";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "../lib/operator/session";
import { signResult } from "../lib/security/guard";
import { hasMagic } from "../lib/submissions/service";
import { submissionsToCsv } from "../lib/submissions/export";
import { useMemoryStoreForTests } from "../lib/submissions/store";
import type { CalculationInput } from "../lib/calc/types";

const custom = { venueSido: "충청남도", venueSigungu: "아산시", startDate: "2026-12-07", endDate: "2026-12-09", lodgingProvided: false, mealsProvided: false };
const leg = { sido: "서울특별시", sigungu: "중구", transport: "train" as const, transportActual: 20000 };
const input: CalculationInput = { courseId: "custom", customCourse: custom, outbound: leg, inbound: leg, nights: 1, lodgingActuals: [70000], mealDays: 2 };
const result = calculateExpense(input, { outbound: { fare: 12800 }, inbound: { fare: 12800 } });

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function json(url: string, body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request(url, { method, headers: { "Content-Type": "application/json", "x-forwarded-for": "3.3.3.3", ...headers }, body: JSON.stringify(body) });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let store: ReturnType<typeof useMemoryStoreForTests>;
const cookie = () => ({ cookie: `${SESSION_COOKIE}=${createSessionToken()}` });

beforeEach(() => {
  store = useMemoryStoreForTests();
  resetRateLimit();
  vi.stubEnv("OPERATOR_PASSWORD", "pw-for-test-1234");
  vi.stubEnv("OPERATOR_SESSION_SECRET", "secret-for-test-abcdef");
});

async function submitOk(name = "홍길동") {
  const res = await createPost(json("http://x/api/submissions", { name, employeeNo: "A12345", consent: true, input, result, signature: signResult(result), meta: { fetchedAt: "2026-11-12T00:00:00Z", notes: [] } }));
  expect(res.status).toBe(200);
  return (await res.json()).data as { id: string; uploadKey: string; uploadMode: string };
}

async function uploadFile(id: string, key: string, kind: string, bytes = JPEG, type = "image/jpeg") {
  const form = new FormData();
  form.set("uploadKey", key);
  form.set("kind", kind);
  form.set("file", new File([bytes as BlobPart], "영수증.jpg", { type }));
  return filesPost(new Request(`http://x/api/submissions/${id}/files`, { method: "POST", headers: { "x-forwarded-for": "3.3.3.3" }, body: form }), ctx(id));
}

describe("교육생 제출", () => {
  it("이름·사번·동의가 없거나 서명이 틀리면 거절한다", async () => {
    const base = { name: "홍길동", employeeNo: "A12345", consent: true, input, result, signature: signResult(result), meta: { fetchedAt: "", notes: [] } };
    expect((await createPost(json("http://x/api/submissions", { ...base, consent: false }))).status).toBe(400);
    expect((await createPost(json("http://x/api/submissions", { ...base, name: "" }))).status).toBe(400);
    expect((await createPost(json("http://x/api/submissions", { ...base, employeeNo: "!!" }))).status).toBe(400);
    const forged = { ...result, total: 999999 };
    expect((await createPost(json("http://x/api/submissions", { ...base, result: forged }))).status).toBe(400);
    expect((await createPost(json("http://x/api/submissions", { ...base, signature: "0".repeat(64) }))).status).toBe(400);
  });

  it("JSON이 아니거나 다른 사이트에서 온 요청은 거절한다", async () => {
    const plain = await createPost(new Request("http://x/api/submissions", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" }));
    expect(plain.status).toBe(415);
    const cross = await createPost(json("http://x/api/submissions", {}, { "Sec-Fetch-Site": "cross-site" }));
    expect(cross.status).toBe(403);
  });

  it("초안 → 증빙 올리기 → 확정까지 되고, 확정 전에는 목록에 나오지 않는다", async () => {
    const d = await submitOk();
    expect(d.uploadMode).toBe("server");
    expect(d.id).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await store.list()).length).toBe(0);
    expect((await uploadFile(d.id, d.uploadKey, "highpass")).status).toBe(200);
    expect((await uploadFile(d.id, d.uploadKey, "lodging")).status).toBe(200);
    const fin = await finalizePost(json(`http://x/api/submissions/${d.id}/finalize`, { uploadKey: d.uploadKey, files: [] }), ctx(d.id));
    expect(fin.status).toBe(200);
    expect((await fin.json()).data.files).toBe(2);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "홍길동", employeeNo: "A12345", venue: "충청남도 아산시", files: 2 });
    // 확정된 제출에는 더 올릴 수 없다
    expect((await uploadFile(d.id, d.uploadKey, "other")).status).toBe(403);
  });

  it("업로드 키가 틀리거나 형식·종류가 허용되지 않으면 거절한다", async () => {
    const d = await submitOk();
    expect((await uploadFile(d.id, "x".repeat(48), "highpass")).status).toBe(403);
    expect((await uploadFile(d.id, d.uploadKey, "weird")).status).toBe(400);
    expect((await uploadFile(d.id, d.uploadKey, "highpass", new Uint8Array([1, 2, 3]), "text/html")).status).toBe(400);
    // 확장자만 이미지인 가짜 파일(내용이 JPEG가 아님)
    expect((await uploadFile(d.id, d.uploadKey, "highpass", new Uint8Array([0x4d, 0x5a, 0, 0]), "image/jpeg")).status).toBe(400);
  });

  it("증빙은 10개까지만 올라간다", async () => {
    const d = await submitOk();
    for (let i = 0; i < 10; i++) expect((await uploadFile(d.id, d.uploadKey, "other")).status).toBe(200);
    expect((await uploadFile(d.id, d.uploadKey, "other")).status).toBe(400);
  });

  it("파일 형식 확인(매직 넘버)", () => {
    expect(hasMagic("image/jpeg", JPEG)).toBe(true);
    expect(hasMagic("application/pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
    expect(hasMagic("image/png", JPEG)).toBe(false);
    expect(hasMagic("text/html", JPEG)).toBe(false);
  });
});

describe("운영자 접근과 취합", () => {
  it("로그인 없이는 목록·상세·파일·내보내기에 접근할 수 없다", async () => {
    const r = (url: string) => new Request(url);
    expect((await listGet(r("http://x/api/operator/submissions"))).status).toBe(401);
    expect((await detailGet(r("http://x/api/operator/submissions/ABCD-2345"), ctx("ABCD-2345"))).status).toBe(401);
    expect((await exportGet(r("http://x/api/operator/export?ids=ABCD-2345"))).status).toBe(401);
    expect((await fileGet(r("http://x/api/operator/files/ABCD-2345/0123456789abcdef"), { params: Promise.resolve({ id: "ABCD-2345", fileId: "0123456789abcdef" }) })).status).toBe(401);
    expect((await listDelete(json("http://x/api/operator/submissions", { ids: ["ABCD-2345"] }, {}, "DELETE"))).status).toBe(401);
  });

  it("세션 값은 서명·만료를 확인한다", () => {
    const now = Date.now();
    const t = createSessionToken(now);
    expect(verifySessionToken(t, now + 1)).toBe(true);
    expect(verifySessionToken(t, now + 9 * 3600 * 1000)).toBe(false); // 8시간 지남
    expect(verifySessionToken(t.replace(/.$/, (c) => (c === "a" ? "b" : "a")), now + 1)).toBe(false);
    expect(verifySessionToken("garbage")).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
  });

  it("비밀번호가 맞으면 쿠키를 주고, 틀리면 거절하며, 5번 넘게 틀리면 막는다", async () => {
    const ok = await loginPost(json("http://x/api/operator/login", { password: "pw-for-test-1234" }));
    expect(ok.status).toBe(200);
    const sc = ok.headers.get("set-cookie") ?? "";
    expect(sc).toContain("HttpOnly");
    expect(sc).toContain("SameSite=Strict");
    expect((await loginPost(json("http://x/api/operator/login", { password: "nope" }, { "x-forwarded-for": "4.4.4.4" }))).status).toBe(401);
    let last = 401;
    for (let i = 0; i < 6; i++) last = (await loginPost(json("http://x/api/operator/login", { password: "nope" }, { "x-forwarded-for": "5.5.5.5" }))).status;
    expect(last).toBe(429);
  });

  it("운영자 환경 변수가 없으면 모두 닫혀 있다", async () => {
    vi.stubEnv("OPERATOR_PASSWORD", "");
    expect((await loginPost(json("http://x/api/operator/login", { password: "" }))).status).toBe(503);
    expect((await listGet(new Request("http://x/api/operator/submissions", { headers: cookie() }))).status).toBe(503);
  });

  it("로그인한 운영자는 목록·상세·증빙·CSV를 보고, 삭제하면 증빙까지 지워진다", async () => {
    const d = await submitOk("김영희");
    await uploadFile(d.id, d.uploadKey, "highpass");
    await finalizePost(json(`http://x/api/submissions/${d.id}/finalize`, { uploadKey: d.uploadKey, files: [] }), ctx(d.id));

    const list = await (await listGet(new Request("http://x/api/operator/submissions", { headers: cookie() }))).json();
    expect(list.data.submissions[0].name).toBe("김영희");

    const detail = await (await detailGet(new Request(`http://x/api/operator/submissions/${d.id}`, { headers: cookie() }), ctx(d.id))).json();
    expect(detail.data.submitter).toEqual({ name: "김영희", employeeNo: "A12345" });
    expect(detail.data.uploadKeyHash).toBeUndefined(); // 업로드 키 해시는 내보내지 않는다
    const fid = detail.data.files[0].id as string;

    const file = await fileGet(new Request(`http://x/api/operator/files/${d.id}/${fid}`, { headers: cookie() }), { params: Promise.resolve({ id: d.id, fileId: fid }) });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    const dl = await fileGet(new Request(`http://x/api/operator/files/${d.id}/${fid}?download=1`, { headers: cookie() }), { params: Promise.resolve({ id: d.id, fileId: fid }) });
    expect(dl.headers.get("content-disposition")).toContain("attachment");

    const csvRes = await exportGet(new Request(`http://x/api/operator/export?ids=${d.id}`, { headers: cookie() }));
    const bytes = new Uint8Array(await csvRes.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // 엑셀에서 한글이 깨지지 않게 BOM
    const csv = new TextDecoder().decode(bytes);
    expect(csv).toContain("김영희");
    expect(csv).toContain("하이패스 영수증");

    const del = await listDelete(json("http://x/api/operator/submissions", { ids: [d.id] }, cookie(), "DELETE"));
    expect(del.status).toBe(200);
    expect((await store.list()).length).toBe(0);
    expect(await store.headFile(detail.data.files[0].blobPath)).toBeNull(); // 증빙 파일도 삭제
  });

  it("CSV에는 입력값과 인정 금액이 모두 들어간다", async () => {
    const d = await submitOk();
    const sub = (await store.get(d.id))!;
    const csv = submissionsToCsv([sub]);
    expect(csv).toContain("A12345");
    expect(csv).toContain("충청남도 아산시");
    expect(csv).toContain(String(result.total));
  });
});
