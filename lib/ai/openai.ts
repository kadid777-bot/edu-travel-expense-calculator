// Design Ref: §2.3 — OpenAI Chat Completions 호출 (서버 전용, 키: OPENAI_API_KEY)
// 보안: 키와 요청 내용(질문)은 로그에 남기지 않는다. 실패해도 예외 대신 실패 값을 돌려준다.
const URL_CHAT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1-mini";
const AI_TIMEOUT_MS = 25_000;

export type ChatResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export async function chatJson<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<ChatResult<T>> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, reason: "no-key" };
  try {
    const res = await fetch(URL_CHAT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        temperature: 0,
        max_tokens: opts.maxTokens ?? 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[ai] OpenAI failed: HTTP ${res.status}`);
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { ok: false, reason: "empty" };
    return { ok: true, data: JSON.parse(content) as T };
  } catch (e) {
    const reason = e instanceof Error ? e.name : "unknown";
    console.warn(`[ai] OpenAI failed: ${reason}`);
    return { ok: false, reason };
  }
}
