"use client";

// Design Ref: §5.1 ③ 규정에 대해 물어보기 — 질문 입력, 5문장 이내 답변, 근거 조항, 개인정보 입력 금지 안내
import { useState } from "react";

interface AskData {
  answer: string;
  refs: { document: string; article: string }[];
  found: boolean;
  refused: boolean;
}

const EXAMPLES = ["KTX 특실을 타도 되나요?", "숙박비는 하루에 얼마까지 인정되나요?", "교육 중 식사를 제공하면 식비는 어떻게 되나요?"];

export default function AskBox() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AskData | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult(null);
        setError(json?.error?.message ?? "답변을 받지 못했습니다");
        return;
      }
      setResult(json.data);
    } catch {
      setResult(null);
      setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-label="규정 질문" className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">③ 규정에 대해 물어보기</h2>

      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="question" className="sr-only">
          질문
        </label>
        <textarea
          id="question"
          rows={3}
          maxLength={500}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="예: 항공을 이용하면 얼마까지 인정되나요?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">이름·연락처는 입력하지 마세요. (최대 500자)</p>

        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuestion(ex)}
              className="rounded-full border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {ex}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={loading || question.trim() === ""}
          className="lift w-full rounded-full bg-black px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "찾아보는 중…" : "질문하기"}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900" aria-live="polite">
          <p className="whitespace-pre-wrap">{result.answer}</p>
          {result.refs.length > 0 && (
            <p className="text-xs text-zinc-500">근거: {result.refs.map((r) => `${r.document} ${r.article}`).join(" / ")}</p>
          )}
          {!result.found && !result.refused && (
            <p className="text-xs text-zinc-500">AI는 규정에 적힌 내용만 답해요. 규정에서 근거를 찾지 못하면 이렇게 안내해요.</p>
          )}
        </div>
      )}
    </section>
  );
}
