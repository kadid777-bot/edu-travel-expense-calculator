// Design Ref: §2.2 처리 4 / §6 — 외부 호출 공통 틀: 5초 시간 제한, 실패해도 예외 대신 "실패 값"을 돌려준다
// 보안: 요청 주소에 인증키가 들어갈 수 있으므로 주소·키는 로그에 남기지 않는다.

export const EXTERNAL_TIMEOUT_MS = 5_000;

export type FetchResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export async function fetchJson<T>(
  label: string,
  url: string | URL,
  init: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url, {
      headers: init.headers,
      signal: AbortSignal.timeout(init.timeoutMs ?? EXTERNAL_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[external] ${label} failed: HTTP ${res.status}`);
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    const reason = e instanceof Error ? e.name : "unknown";
    console.warn(`[external] ${label} failed: ${reason}`);
    return { ok: false, reason };
  }
}

// ── 아주 단순한 메모리 캐시: 같은 구간·같은 날짜의 반복 조회를 줄인다 (서버가 새로 뜨면 비워진다) ──
const store = new Map<string, { value: unknown; expires: number }>();

/** 성공(null이 아닌) 결과만 ttlMs 동안 캐시한다 */
export async function memo<T>(key: string, ttlMs: number, load: () => Promise<T | null>): Promise<T | null> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  if (value !== null) store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

/** 시험용: 캐시 비우기 */
export function clearMemo(): void {
  store.clear();
}

/** 동시에 최대 limit개만 실행한다 (외부 서비스의 호출 횟수 제한 보호) */
export async function runLimited<T>(tasks: (() => Promise<T>)[], limit = 8): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
