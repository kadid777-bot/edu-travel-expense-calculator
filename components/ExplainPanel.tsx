"use client";

// Design Ref: §5.1 ② "쉬운 말로 설명 보기" — 계산 결과의 항목별 설명 (금액은 계산 결과 그대로)
import { useState } from "react";
import type { CalculationResult } from "../lib/calc/types";

interface Explanation {
  category: string;
  text: string;
  fallback: boolean;
}

export default function ExplainPanel({ result, signature }: { result: CalculationResult; signature: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Explanation[] | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, signature }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "설명을 받지 못했습니다");
        return;
      }
      setItems(json.data.explanations);
    } catch {
      setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="rounded-2xl border border-[var(--md-outline-variant)] px-4 py-2 text-sm font-medium hover:bg-[var(--md-container-high)] disabled:opacity-60"
      >
        {loading ? "설명을 만드는 중…" : "쉬운 말로 설명 보기"}
      </button>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {items && (
        <ul className="space-y-2 rounded-3xl border border-[var(--md-outline-variant)] bg-[var(--md-lowest)] p-4 text-sm" aria-live="polite">
          {items.map((it) => (
            <li key={it.category}>
              <span className="font-medium">{it.category}</span> — {it.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
