// Design Ref: §2.2 ③ 산출 근거 설명 — 계산 결과의 금액은 그대로 두고 쉬운 말로 풀어 쓴다
// 안전장치: AI 설명 안의 숫자가 결과에 없는 값이면 그 항목은 AI 문장 대신 정해진 문장으로 바꾼다.
// 개인정보 없음: 보내는 내용은 금액·조항·계산에 쓴 값뿐이다.
import { z } from "zod";
import { chatJson } from "./openai";

const CATEGORIES = ["교통비(가는 편)", "교통비(오는 편)", "숙박비", "일비", "식비"] as const;

const itemSchema = z.object({
  category: z.enum(CATEGORIES),
  actual: z.number().optional(),
  limit: z.number().optional(),
  approved: z.number(),
  excess: z.number().optional(),
  refs: z.array(z.object({ document: z.string().max(20), article: z.string().max(200) })).max(10),
  notes: z.array(z.string().max(400)).max(20),
  calcValues: z.record(z.string().max(40), z.number()).optional(),
});

export const resultSchema = z.object({
  items: z.array(itemSchema).min(1).max(5),
  total: z.number(),
  warnings: z.array(z.string().max(400)).max(10),
  notices: z.array(z.string().max(400)).max(10),
  shortDistance: z.object({ outbound: z.boolean(), inbound: z.boolean() }),
});

export type ExplainInput = z.infer<typeof resultSchema>;
export interface Explanation {
  category: string;
  text: string;
  /** true면 AI 문장이 아니라 정해진 문장 */
  fallback: boolean;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** AI 없이 만드는 기본 설명 (AI 실패·검증 실패 시 사용) */
export function fallbackExplanation(item: ExplainInput["items"][number]): string {
  const parts = [`${item.category}은(는) ${won(item.approved)}이(가) 인정됩니다.`];
  if (item.limit !== undefined && item.actual !== undefined) {
    parts.push(`입력한 값은 ${won(item.actual)}이고 한도는 ${won(item.limit)}입니다.`);
  }
  if (item.excess !== undefined && item.excess > 0) parts.push(`한도를 넘은 ${won(item.excess)}은 인정되지 않습니다.`);
  if (item.notes[0]) parts.push(item.notes[0].replace(/\s+$/, ""));
  return parts.join(" ");
}

/** 텍스트 안의 숫자들 (쉼표 제거) */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((s) => s.replace(/,/g, ""));
}

/** AI 문장 안의 숫자가 모두 결과에 있는 값(또는 10 이하의 작은 수)인지 */
export function numbersAllowed(text: string, input: ExplainInput): boolean {
  const allowed = new Set(numbersIn(JSON.stringify(input)));
  return numbersIn(text).every((n) => allowed.has(n) || (Number(n) <= 10 && Number.isInteger(Number(n))));
}

const SYSTEM_PROMPT = `너는 교육 여비 계산 결과를 처음 보는 교육생에게 쉬운 말로 설명하는 도우미다.
입력 JSON의 각 항목(category)마다 1~2문장으로 왜 이 금액이 나왔는지 설명한다.

규칙:
1. 입력에 있는 숫자만 그대로 쓴다. 새로 계산하거나 반올림하거나 바꾸지 않는다.
2. 입력에 없는 규정·조건·금액을 만들지 않는다.
3. 한도를 넘어 인정되지 않은 금액(excess)이 있으면 그 이유(notes)를 함께 설명한다.
3-1. calcValues에 "연료비"가 있는 교통비(자차)의 actual은 영수증 금액이 아니라 "거리×유가÷연비 + 하이패스"로 산출한 금액이다. "실제로 들었다"고 쓰지 말고 "계산한 금액"이라고 쓴다.
4. 출력은 JSON 한 개만: {"explanations": [{"category": string, "text": string}]} (입력의 category를 그대로 쓴다)`;

export async function explainResult(input: ExplainInput): Promise<{ explanations: Explanation[]; usedAi: boolean }> {
  const base = input.items.map((item) => ({ category: item.category, text: fallbackExplanation(item), fallback: true }));
  const r = await chatJson<{ explanations?: { category?: unknown; text?: unknown }[] }>({
    system: SYSTEM_PROMPT,
    user: JSON.stringify(input),
    maxTokens: 900,
  });
  if (!r.ok || !Array.isArray(r.data.explanations)) return { explanations: base, usedAi: false };

  let usedAi = false;
  const explanations = base.map((b) => {
    const ai = r.data.explanations!.find((e) => e?.category === b.category);
    if (typeof ai?.text !== "string" || ai.text.trim() === "" || !numbersAllowed(ai.text, input)) return b;
    usedAi = true;
    return { category: b.category, text: ai.text.replace(/\s+/g, " ").trim(), fallback: false };
  });
  return { explanations, usedAi };
}
