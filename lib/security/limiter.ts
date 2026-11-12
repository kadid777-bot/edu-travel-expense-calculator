// 서버 여러 대가 함께 쓰는 요청 횟수 제한 (Redis가 있으면 공유, 없으면 서버 메모리)
// 기존 lib/ai/rate-limit.ts는 메모리 방식이라 서버가 여러 개 뜨는 Vercel에서는 새어 나간다 → 여기서 보완한다.
import { Redis } from "@upstash/redis";
import { allowDaily, allowRequest } from "../ai/rate-limit";

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

/** key별로 windowSec 동안 limit번까지 허용. Redis 오류 시에는 메모리 제한으로 대신한다 */
export async function allowShared(key: string, limit: number, windowSec: number): Promise<boolean> {
  const r = getRedis();
  if (!r) return allowRequest(key, limit, windowSec * 1000);
  try {
    const k = `rl:${key}`;
    const n = await r.incr(k);
    if (n === 1) await r.expire(k, windowSec);
    return n <= limit;
  } catch {
    return allowRequest(key, limit, windowSec * 1000);
  }
}

/** 서버 전체 하루 상한 */
export async function allowSharedDaily(name: string, limit: number): Promise<boolean> {
  const r = getRedis();
  if (!r) return allowDaily(name, limit);
  try {
    const day = new Date().toISOString().slice(0, 10);
    const k = `rl:daily:${name}:${day}`;
    const n = await r.incr(k);
    if (n === 1) await r.expire(k, 2 * 86400);
    return n <= limit;
  } catch {
    return allowDaily(name, limit);
  }
}
