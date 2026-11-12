"use client";

// Design Ref: §5.3 운영자 화면 — 과정 선택 → 명단 붙여넣기/CSV 올리기 → 25명씩 나눠 산출(진행률·실패 묶음 다시 시도)
import { useMemo, useState } from "react";
import { CHUNK_SIZE, CSV_HEADER, MAX_PEOPLE, chunk, parseRows, toCsv } from "../../lib/calc/batch";
import type { Course } from "../../lib/calc/types";
import BatchTable from "./BatchTable";
import type { BatchOutcome } from "./types";

const inputCls = "w-full rounded border border-zinc-400 bg-transparent px-3 py-2 text-sm dark:border-zinc-600";

export default function BatchUpload({ courses }: { courses: Course[] }) {
  const [courseId, setCourseId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<Record<number, BatchOutcome>>({});
  const [failedChunks, setFailedChunks] = useState<number[]>([]);
  const [message, setMessage] = useState("");

  const parsed = useMemo(() => parseRows(text), [text]);
  const tooMany = parsed.rows.length > MAX_PEOPLE;
  const names = useMemo(() => Object.fromEntries(parsed.rows.map((r) => [r.rowNo, r.name])), [parsed.rows]);
  const chunks = useMemo(() => chunk(parsed.rows), [parsed.rows]);

  function downloadTemplate() {
    const sample = ["홍길동", "서울특별시", "강남구", "기차", "30000", "서울특별시", "강남구", "기차", "30000", "1", "70000", "0"];
    const blob = new Blob([toCsv([CSV_HEADER, sample])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "교육여비_명단_양식.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setMessage("파일이 너무 큽니다(1MB 이하). 엑셀은 'CSV'로 저장해서 올려 주세요");
      return;
    }
    setText(await file.text());
    setMessage("");
  }

  async function runChunk(index: number): Promise<boolean> {
    const rows = chunks[index].map((r) => ({ rowNo: r.rowNo, ...r.input })); // 이름은 보내지 않는다
    try {
      const res = await fetch("/api/calculate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "계산하지 못했습니다");
      setOutcomes((prev) => {
        const next = { ...prev };
        for (const r of json.data.results as BatchOutcome[]) next[r.rowNo] = r;
        return next;
      });
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "서버에 연결하지 못했습니다");
      return false;
    }
  }

  async function start(only?: number[]) {
    if (!courseId) return setMessage("교육 과정을 선택해 주세요");
    if (parsed.rows.length === 0) return setMessage("계산할 명단이 없습니다");
    if (tooMany) return setMessage(`한 번에 최대 ${MAX_PEOPLE}명까지 계산할 수 있습니다`);
    setBusy(true);
    setMessage("");
    const targets = only ?? chunks.map((_, i) => i);
    if (!only) setOutcomes({});
    setProgress({ done: 0, total: targets.length });
    const failed: number[] = [];
    for (const idx of targets) {
      const ok = await runChunk(idx);
      if (!ok) failed.push(idx);
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setFailedChunks(failed);
    setBusy(false);
  }

  const list = Object.values(outcomes).sort((a, b) => a.rowNo - b.rowNo);
  return (
    <div className="space-y-5">
      <label className="block space-y-1">
        <span className="text-sm font-medium">교육 과정</span>
        <select className={inputCls} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">과정을 선택하세요</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">교육생 명단</span>
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            양식 내려받기(CSV)
          </button>
          <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} className="text-xs" aria-label="명단 파일 올리기" />
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          엑셀에서 표를 복사해 붙여넣거나, 엑셀을 &apos;CSV&apos;로 저장해 올리세요. 한 줄에 한 명이고 칸은 {CSV_HEADER.join(" · ")} 순서예요.
          이름은 이 브라우저에서만 쓰고 서버로 보내지 않아요. 한 번에 최대 {MAX_PEOPLE}명이고 서버에는 {CHUNK_SIZE}명씩 나눠 보내요.
        </p>
        <textarea
          className={`${inputCls} h-40 font-mono`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="홍길동, 서울특별시, 강남구, 기차, 30000, ..."
          aria-label="교육생 명단"
        />
        <p className="text-sm" aria-live="polite">
          인식된 인원 {parsed.rows.length}명
          {tooMany && <strong className="text-red-600"> — 최대 {MAX_PEOPLE}명을 넘었습니다</strong>}
          {parsed.errors.length > 0 && (
            <span className="text-amber-700 dark:text-amber-400"> · 확인이 필요한 줄 {parsed.errors.length}개</span>
          )}
        </p>
        {parsed.errors.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700 dark:text-amber-400">
            {parsed.errors.slice(0, 10).map((er) => (
              <li key={er.line}>
                {er.line}번째 줄: {er.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => start()}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "계산 중…" : "일괄 산출"}
        </button>
        {progress.total > 0 && (
          <span className="text-sm" aria-live="polite">
            진행 {progress.done}/{progress.total}
          </span>
        )}
        {!busy && failedChunks.length > 0 && (
          <button
            type="button"
            onClick={() => start(failedChunks)}
            className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-600"
          >
            실패한 {failedChunks.length}묶음 다시 시도
          </button>
        )}
      </div>
      {message && (
        <p role="alert" className="text-sm text-red-600">
          {message}
        </p>
      )}
      {list.length > 0 && <BatchTable outcomes={list} names={names} />}
    </div>
  );
}
