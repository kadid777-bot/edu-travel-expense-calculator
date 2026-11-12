// AI 호출 비용·남용을 막는 아주 단순한 요청 횟수 제한 (서버 메모리, 서버가 새로 뜨면 초기화되는 "최선 노력" 방식)
const hits = new Map<string, number[]>();

/** key(예: IP)별로 windowMs 동안 limit번까지 허용한다. 넘으면 false */
const MAX_KEYS = 5000;
const daily = new Map<string, { day: string; count: number }>();

/** 서버 전체 하루 상한(비용 폭주 방지). 서버가 새로 뜨면 초기화되는 최선 노력 방식 */
export function allowDaily(name: string, limit: number, now = Date.now()): boolean {
  const day = new Date(now).toISOString().slice(0, 10);
  const cur = daily.get(name);
  const entry = cur && cur.day === day ? cur : { day, count: 0 };
  if (entry.count >= limit) return false;
  entry.count += 1;
  daily.set(name, entry);
  return true;
}

export function allowRequest(key: string, limit = 20, windowMs = 10 * 60 * 1000, now = Date.now()): boolean {
  if (hits.size > MAX_KEYS) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    if (hits.size > MAX_KEYS) hits.clear();
  }
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "local";
}

/** 시험용 */
export function resetRateLimit(): void {
  hits.clear();
  daily.clear();
}
