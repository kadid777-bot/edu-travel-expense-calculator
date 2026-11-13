"use client";

// Design Ref: docs/SUBMISSION-DESIGN.md §4 — 운영자 제출 목록: 검색·선택·CSV·증빙 ZIP·다시 계산·삭제, 30일 지난 건 경고
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SubmissionSummary } from "../../lib/submissions/types";

const DAY = 86_400_000;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

interface Recalc {
  id: string;
  name?: string;
  submittedTotal?: number;
  nowTotal?: number;
  diffs?: { category: string; submitted: number; now: number }[];
  error?: string;
}

export default function SubmissionList() {
  const [rows, setRows] = useState<SubmissionSummary[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [recalc, setRecalc] = useState<Recalc[] | null>(null);

  // 현재 시각은 서버에서 미리 만들 수 없는 값이라, 목록을 불러온 시점(브라우저)에 정한다
  const [nowMs, setNowMs] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1); // 목록 다시 불러오기

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/operator/submissions", { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json?.error?.message ?? "목록을 불러오지 못했습니다");
        setRows(json.data.submissions);
        setNowMs(Date.now());
        setError("");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다");
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !t || [r.id, r.name, r.employeeNo, r.venue].some((v) => v.toLowerCase().includes(t)));
  }, [rows, q]);

  const old = nowMs === 0 ? 0 : (rows ?? []).filter((r) => nowMs - Date.parse(r.createdAt) > 30 * DAY).length;
  const ids = [...selected];
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function download(blob: Blob, name: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportCsv() {
    setBusy("csv");
    try {
      const res = await fetch(`/api/operator/export?ids=${ids.join(",")}`);
      if (!res.ok) throw new Error("내려받지 못했습니다");
      download(await res.blob(), "교육여비_제출내역.csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "내려받지 못했습니다");
    } finally {
      setBusy("");
    }
  }

  async function exportZip() {
    setBusy("zip");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let count = 0;
      for (const id of ids) {
        const d = await (await fetch(`/api/operator/submissions/${id}`)).json();
        const sub = d.data;
        if (!sub) continue;
        const folder = zip.folder(`${id}_${sub.submitter.name}_${sub.submitter.employeeNo}`)!;
        for (const f of sub.files as { id: string; kind: string; contentType: string; name: string }[]) {
          const r = await fetch(`/api/operator/files/${id}/${f.id}?download=1`);
          if (!r.ok) continue;
          const ext = f.contentType === "application/pdf" ? "pdf" : f.contentType.split("/")[1].replace("jpeg", "jpg");
          folder.file(`${f.kind}_${f.id.slice(0, 6)}.${ext}`, await r.blob());
          count++;
        }
      }
      if (count === 0) throw new Error("선택한 제출에 증빙 파일이 없습니다");
      download(await zip.generateAsync({ type: "blob" }), "교육여비_증빙.zip");
    } catch (e) {
      setError(e instanceof Error ? e.message : "묶음 파일을 만들지 못했습니다");
    } finally {
      setBusy("");
    }
  }

  async function recompute() {
    setBusy("recalc");
    setRecalc(null);
    try {
      const res = await fetch("/api/operator/recalculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(0, 25) }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "다시 계산하지 못했습니다");
      setRecalc(json.data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 계산하지 못했습니다");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm(`선택한 ${ids.length}건과 그 증빙 파일을 삭제합니다. 되돌릴 수 없어요. 삭제할까요?`)) return;
    setBusy("delete");
    try {
      const res = await fetch("/api/operator/submissions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? "삭제하지 못했습니다");
      setSelected(new Set());
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제하지 못했습니다");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      {old > 0 && (
        <p role="status" className="rounded-2xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          제출한 지 30일이 지난 건이 {old}건 있어요. 정산이 끝났다면 영수증 개인정보가 남지 않도록 삭제해 주세요.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="sub-search" className="sr-only">
          검색
        </label>
        <input id="sub-search" placeholder="이름·사번·접수 번호·교육 장소 검색" className="min-w-0 flex-1 rounded-2xl border border-[var(--md-outline-variant)] bg-[var(--md-lowest)] px-3 py-2 text-sm" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={load} className="rounded-full border border-[var(--md-outline-variant)] px-3 py-1.5 text-sm">
          새로고침
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>선택 {ids.length}건</span>
        <button type="button" disabled={ids.length === 0 || !!busy} onClick={exportCsv} className="rounded-full border border-[var(--md-outline-variant)] px-3 py-1.5 disabled:opacity-50">
          산출 내역 CSV
        </button>
        <button type="button" disabled={ids.length === 0 || !!busy} onClick={exportZip} className="rounded-full border border-[var(--md-outline-variant)] px-3 py-1.5 disabled:opacity-50">
          {busy === "zip" ? "묶는 중…" : "증빙 ZIP"}
        </button>
        <button type="button" disabled={ids.length === 0 || !!busy} onClick={recompute} className="rounded-full border border-[var(--md-outline-variant)] px-3 py-1.5 disabled:opacity-50">
          {busy === "recalc" ? "계산 중…" : "지금 요금으로 다시 계산"}
        </button>
        <button type="button" disabled={ids.length === 0 || !!busy} onClick={remove} className="rounded-full border border-red-500 px-3 py-1.5 text-red-700 disabled:opacity-50 dark:text-red-400">
          삭제
        </button>
      </div>

      {recalc && (
        <div className="space-y-1 rounded-2xl border border-[var(--md-outline-variant)] p-3 text-sm">
          <strong>다시 계산 결과 (제출값과 비교)</strong>
          {recalc.map((r) => (
            <p key={r.id}>
              {r.id} {r.name ?? ""} —{" "}
              {r.error
                ? r.error
                : r.diffs && r.diffs.length > 0
                  ? `차이 있음: 제출 ${won(r.submittedTotal ?? 0)} → 지금 ${won(r.nowTotal ?? 0)} (${r.diffs.map((d) => `${d.category} ${won(d.submitted)}→${won(d.now)}`).join(", ")})`
                  : `같음 (${won(r.nowTotal ?? 0)})`}
            </p>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--md-outline-variant)] text-left">
              <th className="p-2">
                <input
                  type="checkbox"
                  aria-label="전체 선택"
                  checked={shown.length > 0 && shown.every((r) => selected.has(r.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())}
                />
              </th>
              <th className="p-2">접수 번호</th>
              <th className="p-2">제출 시각</th>
              <th className="p-2">이름·사번</th>
              <th className="p-2">교육 장소·기간</th>
              <th className="p-2 text-right">합계</th>
              <th className="p-2 text-right">경고</th>
              <th className="p-2 text-right">증빙</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const days = nowMs === 0 ? 0 : Math.floor((nowMs - Date.parse(r.createdAt)) / DAY);
              return (
                <tr key={r.id} className="border-b border-[var(--md-outline-variant)]">
                  <td className="p-2">
                    <input type="checkbox" aria-label={`${r.id} 선택`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="p-2 font-medium">
                    <Link className="underline" href={`/operator/submission?id=${r.id}`}>
                      {r.id}
                    </Link>
                  </td>
                  <td className="p-2">
                    {new Date(r.createdAt).toLocaleString("ko-KR")}
                    {days >= 30 && <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">({days}일 지남)</span>}
                  </td>
                  <td className="p-2">
                    {r.name} · {r.employeeNo}
                  </td>
                  <td className="p-2">
                    {r.venue} {r.startDate} ~ {r.endDate}
                  </td>
                  <td className="p-2 text-right tabular-nums">{won(r.total)}</td>
                  <td className="p-2 text-right">{r.warnings > 0 ? r.warnings : "-"}</td>
                  <td className="p-2 text-right">{r.files}</td>
                </tr>
              );
            })}
            {rows !== null && shown.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-[var(--md-on-surface-variant)]">
                  제출된 내역이 없어요
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
