"use client";

// 선언문: 화면을 내리는 만큼 단어가 회색(#6f6f6f)에서 흰색(#f4f4f4)으로 차례로 채워진다 (가장자리 3단어는 부드럽게)
import { useEffect, useRef } from "react";

const FROM = [0x6f, 0x6f, 0x6f];
const TO = [0xf4, 0xf4, 0xf4];
const SOFT_EDGE = 3;

function mix(t: number): string {
  const c = FROM.map((f, i) => Math.round(f + (TO[i] - f) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export default function StatementFill({ lines }: { lines: string[] }) {
  const root = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const words = Array.from(el.querySelectorAll<HTMLElement>("[data-w]"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function paint(progress: number) {
      const n = words.length;
      const head = progress * (n + SOFT_EDGE);
      words.forEach((w, i) => {
        const t = Math.min(1, Math.max(0, (head - i) / SOFT_EDGE));
        w.style.color = mix(t);
      });
    }

    if (reduced) {
      paint(1);
      return;
    }

    function onScroll() {
      const rect = el!.getBoundingClientRect();
      const vh = window.innerHeight;
      // 문단 윗부분이 화면 아래 90% 지점에 들어올 때 시작해 위쪽 5% 지점에 닿을 때 모두 채워진다
      const start = vh * 0.9;
      const end = vh * 0.05;
      paint(Math.min(1, Math.max(0, (start - rect.top) / (start - end))));
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <p
      ref={root}
      className="statement-text mx-auto text-center"
      style={{
        maxWidth: "calc(830 * var(--u))",
        lineHeight: 1.33,
        letterSpacing: "-0.028em",
        color: "var(--grey-fill)",
      }}
    >
      {lines.map((line, li) => (
        <span key={li} className="block max-sm:inline">
          {line.split(" ").map((word, wi) => (
            <span key={wi} data-w style={{ color: "var(--grey-fill)" }}>
              {word}
              {wi < line.split(" ").length - 1 || li < lines.length - 1 ? " " : ""}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}
