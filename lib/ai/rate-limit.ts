// AI 호출 비용·남용을 막는 아주 단순한 요청 횟수 제한 (서버 메모리, 서버가 새로 뜨면 초기화되는 "최선 노력" 방식)
const hits = new Map<string, number[]>();

/** key(예: IP)별로 windowMs 동안 limit번까지 허용한다. 넘으면 false */
export function allowRequest(key: string, limit = 20, windowMs = 10 * 60 * 1000, now = Date.now()): boolean {
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
}
