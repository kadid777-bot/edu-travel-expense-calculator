// Design Ref: docs/SUBMISSION-DESIGN.md §5.3 — 제출 저장소 인터페이스와 구현
//   · 운영(Vercel): 제출 기록은 Redis(KV), 증빙 파일은 Vercel Blob(비공개)
//   · 로컬·테스트: 메모리 (키가 없어도 개발·테스트가 된다)
// 서버 전용: 토큰은 환경 변수에서만 읽는다.
import { createHash, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import { del, get, head, list as blobList, put } from "@vercel/blob";
import type { Submission, SubmissionSummary } from "./types";

export interface BlobObject {
  body: ReadableStream<Uint8Array> | Uint8Array;
  contentType: string;
  size: number;
}

export interface SubmissionStore {
  readonly mode: "vercel" | "memory";
  create(sub: Submission): Promise<void>;
  get(id: string): Promise<Submission | null>;
  save(sub: Submission): Promise<void>;
  list(): Promise<SubmissionSummary[]>;
  /** 제출 기록과 증빙 파일을 모두 지운다 */
  remove(id: string): Promise<void>;
  putFile(path: string, data: Uint8Array, contentType: string): Promise<void>;
  headFile(path: string): Promise<{ size: number; contentType: string } | null>;
  readFile(path: string): Promise<BlobObject | null>;
}

export function summarize(s: Submission): SubmissionSummary {
  const c = s.input.customCourse;
  return {
    id: s.id,
    createdAt: s.createdAt,
    name: s.submitter.name,
    employeeNo: s.submitter.employeeNo,
    venue: c ? `${c.venueSido} ${c.venueSigungu}` : "",
    startDate: c?.startDate ?? "",
    endDate: c?.endDate ?? "",
    total: s.result.total,
    warnings: s.result.warnings.length,
    files: s.files.length,
  };
}

// ── 접수 번호·업로드 키 ─────────────────────────────────────────────────────────
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 글자(0·O·1·I) 제외

export function newSubmissionId(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export const ID_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export function newUploadKey(): string {
  return randomBytes(24).toString("hex");
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// ── 메모리 구현 ─────────────────────────────────────────────────────────────────
class MemoryStore implements SubmissionStore {
  readonly mode = "memory" as const;
  private subs = new Map<string, Submission>();
  private blobs = new Map<string, { data: Uint8Array; contentType: string }>();

  async create(sub: Submission) {
    this.subs.set(sub.id, structuredClone(sub));
  }
  async get(id: string) {
    const s = this.subs.get(id);
    return s ? structuredClone(s) : null;
  }
  async save(sub: Submission) {
    this.subs.set(sub.id, structuredClone(sub));
  }
  async list() {
    return [...this.subs.values()]
      .filter((s) => s.status === "submitted")
      .map(summarize)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async remove(id: string) {
    const s = this.subs.get(id);
    for (const f of s?.files ?? []) this.blobs.delete(f.blobPath);
    for (const k of [...this.blobs.keys()]) if (k.startsWith(`submissions/${id}/`)) this.blobs.delete(k);
    this.subs.delete(id);
  }
  async putFile(path: string, data: Uint8Array, contentType: string) {
    this.blobs.set(path, { data, contentType });
  }
  async headFile(path: string) {
    const b = this.blobs.get(path);
    return b ? { size: b.data.byteLength, contentType: b.contentType } : null;
  }
  async readFile(path: string) {
    const b = this.blobs.get(path);
    return b ? { body: b.data, contentType: b.contentType, size: b.data.byteLength } : null;
  }
  /** 시험용 */
  reset() {
    this.subs.clear();
    this.blobs.clear();
  }
}

// ── Vercel(Redis + Blob) 구현 ───────────────────────────────────────────────────
const SUB_KEY = (id: string) => `sub:${id}`;
const INDEX_KEY = "subs:index"; // 정렬 집합: 점수 = 제출 시각(ms)
const SUMMARY_KEY = (id: string) => `sub:${id}:sum`;

function redisFromEnv(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

class VercelStore implements SubmissionStore {
  readonly mode = "vercel" as const;
  constructor(private redis: Redis) {}

  async create(sub: Submission) {
    // 초안은 24시간 뒤 저절로 사라진다(제출이 확정되면 save가 만료를 없앤다)
    await this.redis.set(SUB_KEY(sub.id), JSON.stringify(sub), { ex: 24 * 3600 });
  }
  async get(id: string) {
    const v = await this.redis.get<string | Submission>(SUB_KEY(id));
    if (!v) return null;
    return typeof v === "string" ? (JSON.parse(v) as Submission) : v;
  }
  async save(sub: Submission) {
    await this.redis.set(SUB_KEY(sub.id), JSON.stringify(sub)); // 만료 없음
    if (sub.status === "submitted") {
      await this.redis.set(SUMMARY_KEY(sub.id), JSON.stringify(summarize(sub)));
      await this.redis.zadd(INDEX_KEY, { score: Date.parse(sub.createdAt), member: sub.id });
    }
  }
  async list() {
    const ids = await this.redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true });
    if (ids.length === 0) return [];
    const raw = await this.redis.mget<(string | SubmissionSummary | null)[]>(...ids.map(SUMMARY_KEY));
    return raw
      .filter((r): r is string | SubmissionSummary => r !== null)
      .map((r) => (typeof r === "string" ? (JSON.parse(r) as SubmissionSummary) : r));
  }
  async remove(id: string) {
    const s = await this.get(id);
    const paths = (s?.files ?? []).map((f) => f.blobPath);
    if (paths.length > 0) await del(paths);
    await this.redis.del(SUB_KEY(id), SUMMARY_KEY(id));
    await this.redis.zrem(INDEX_KEY, id);
  }
  async putFile(path: string, data: Uint8Array, contentType: string) {
    await put(path, Buffer.from(data), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
  }
  async headFile(path: string) {
    try {
      const h = await head(path);
      return { size: h.size, contentType: h.contentType };
    } catch {
      return null;
    }
  }
  async readFile(path: string) {
    const r = await get(path, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return { body: r.stream, contentType: r.blob.contentType, size: r.blob.size };
  }
}

// ── Vercel Blob만 쓰는 구현 (Redis가 없을 때) ───────────────────────────────────
// 제출 기록도 비공개 Blob의 JSON 파일(records/{id}.json)로 저장한다. 별도 가입·약관 없이 Blob 스토어 하나로 동작한다.
const RECORD_PATH = (id: string) => `records/${id}.json`;

async function readJson<T>(path: string): Promise<T | null> {
  const r = await get(path, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return JSON.parse(await new Response(r.stream).text()) as T;
}

class BlobOnlyStore implements SubmissionStore {
  readonly mode = "vercel" as const;

  private async putRecord(sub: Submission) {
    await put(RECORD_PATH(sub.id), JSON.stringify(sub), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  }
  async create(sub: Submission) {
    await this.putRecord(sub);
  }
  async get(id: string) {
    try {
      return await readJson<Submission>(RECORD_PATH(id));
    } catch {
      return null;
    }
  }
  async save(sub: Submission) {
    await this.putRecord(sub);
  }
  async list() {
    const paths: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await blobList({ prefix: "records/", cursor, limit: 500 });
      paths.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    const out: SubmissionSummary[] = [];
    // 한 번에 8개씩 읽는다 (저장소 호출이 한꺼번에 몰리지 않게)
    for (let i = 0; i < paths.length; i += 8) {
      const recs = await Promise.all(paths.slice(i, i + 8).map((p) => readJson<Submission>(p).catch(() => null)));
      for (const r of recs) if (r && r.status === "submitted") out.push(summarize(r));
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async remove(id: string) {
    const s = await this.get(id);
    const paths = (s?.files ?? []).map((f) => f.blobPath);
    await del([...paths, RECORD_PATH(id)]);
  }
  async putFile(path: string, data: Uint8Array, contentType: string) {
    await put(path, Buffer.from(data), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
  }
  async headFile(path: string) {
    try {
      const h = await head(path);
      return { size: h.size, contentType: h.contentType };
    } catch {
      return null;
    }
  }
  async readFile(path: string) {
    const r = await get(path, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return { body: r.stream, contentType: r.blob.contentType, size: r.blob.size };
  }
}

let cached: SubmissionStore | null = null;

/** 환경 변수에 맞는 저장소를 고른다 */
export function getStore(): SubmissionStore {
  if (cached) return cached;
  const redis = redisFromEnv();
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  // Redis+Blob → 빠른 목록, Blob만 → 기록도 Blob에 저장, 둘 다 없으면 메모리(로컬·시험)
  cached = hasBlob ? (redis ? new VercelStore(redis) : new BlobOnlyStore()) : new MemoryStore();
  return cached;
}

/** 시험용: 메모리 저장소를 새로 만들어 쓴다 */
export function useMemoryStoreForTests(): SubmissionStore {
  const m = new MemoryStore();
  cached = m;
  return m;
}
