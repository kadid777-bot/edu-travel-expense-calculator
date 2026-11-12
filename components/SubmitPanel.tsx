"use client";

// Design Ref: docs/SUBMISSION-DESIGN.md §3·§4 — 교육생 제출하기: 이름·사번·동의 → 증빙(하이패스·숙박·교통비 등) 올리기 → 접수 번호
import { upload } from "@vercel/blob/client";
import { useState } from "react";
import type { CalculationResult } from "../lib/calc/types";
import { ALLOWED_TYPES, CONSENT_TEXT, FILE_KINDS, FILE_KIND_LABEL, LIMITS, type FileKind } from "../lib/submissions/types";
import { checkFile, checkTotals, submitterSchema } from "../lib/submissions/validate";
import type { ResultMeta } from "./ResultCard";

interface Picked {
  key: string;
  kind: FileKind;
  file: File;
}

const inputCls = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900";
const ACCEPT = Object.keys(ALLOWED_TYPES).join(",");
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

export default function SubmitPanel({ input, result, meta }: { input: unknown; result: CalculationResult; meta: ResultMeta }) {
  const [name, setName] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [consent, setConsent] = useState(false);
  const [kind, setKind] = useState<FileKind>("highpass");
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError("");
    const next = [...files];
    for (const file of Array.from(list)) {
      const bad = checkFile(file.type, file.size) ?? checkTotals(next.map((f) => f.file), file);
      if (bad) {
        setError(`${file.name}: ${bad}`);
        continue;
      }
      next.push({ key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, file });
    }
    setFiles(next);
  }

  async function submit() {
    setError("");
    const who = submitterSchema.safeParse({ name, employeeNo });
    if (!who.success) return setError(who.error.issues[0].message);
    if (!consent) return setError("개인정보 수집·이용에 동의해 주세요");
    if (files.length === 0 && !window.confirm("증빙 파일 없이 산출 내역만 제출할까요?")) return;

    setBusy(true);
    try {
      setStep("산출 내역을 보내는 중…");
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: who.data.name,
          employeeNo: who.data.employeeNo,
          consent: true,
          input,
          result,
          signature: meta.signature ?? "",
          meta: { fetchedAt: meta.fetchedAt, notes: meta.notes ?? [], evidence: meta.evidence },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "제출하지 못했습니다");
      const { id, uploadKey, uploadMode } = json.data as { id: string; uploadKey: string; uploadMode: "blob" | "server" };

      const declared: { fileId: string; kind: FileKind; name: string; contentType: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setStep(`증빙 올리는 중 (${i + 1}/${files.length})…`);
        if (uploadMode === "blob") {
          const fileId = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
          const ext = ALLOWED_TYPES[f.file.type];
          await upload(`submissions/${id}/${fileId}.${ext}`, f.file, {
            access: "private",
            handleUploadUrl: "/api/submissions/upload",
            contentType: f.file.type,
            clientPayload: JSON.stringify({ id, key: uploadKey, kind: f.kind, contentType: f.file.type, size: f.file.size }),
          });
          declared.push({ fileId, kind: f.kind, name: f.file.name, contentType: f.file.type });
        } else {
          if (f.file.size > LIMITS.serverUploadBytes) throw new Error(`${f.file.name}: 이 환경에서는 4MB까지만 올릴 수 있어요`);
          const form = new FormData();
          form.set("uploadKey", uploadKey);
          form.set("kind", f.kind);
          form.set("file", f.file);
          const up = await fetch(`/api/submissions/${id}/files`, { method: "POST", body: form });
          const uj = await up.json();
          if (!up.ok) throw new Error(uj?.error?.message ?? "증빙을 올리지 못했습니다");
        }
      }

      setStep("제출을 확정하는 중…");
      const fin = await fetch(`/api/submissions/${id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadKey, files: declared }),
      });
      const fj = await fin.json();
      if (!fin.ok) throw new Error(fj?.error?.message ?? "제출을 확정하지 못했습니다");
      setReceipt(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출하지 못했습니다. 잠시 후 다시 시도해 주세요");
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  if (receipt) {
    return (
      <section aria-label="제출 완료" className="space-y-2 rounded-xl border border-emerald-400 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
        <h2 className="text-xl font-semibold tracking-tight">제출했어요</h2>
        <p>
          접수 번호 <strong className="text-2xl tabular-nums tracking-wider">{receipt}</strong>
        </p>
        <p className="text-sm">운영자가 이 내용을 확인해요. 접수 번호를 기록해 두세요. 같은 내용을 다시 제출하면 새 접수 번호가 만들어져요.</p>
      </section>
    );
  }

  return (
    <section aria-label="제출하기" className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-xl font-semibold tracking-tight">④ 운영자에게 제출하기</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        위 산출 내역과 증빙(하이패스·숙박비·교통비 영수증 등)을 운영자에게 보내요. 영수증에 보이는 카드번호·주민등록번호는 가려서 올려 주세요.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="sub-name" className="mb-1 block text-sm font-medium">
            이름
          </label>
          <input id="sub-name" className={inputCls} value={name} maxLength={30} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="sub-empno" className="mb-1 block text-sm font-medium">
            사번
          </label>
          <input id="sub-empno" className={inputCls} value={employeeNo} maxLength={20} onChange={(e) => setEmployeeNo(e.target.value)} />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">증빙 파일 (사진·PDF, 하나에 10MB까지, 10개까지)</legend>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="sub-kind" className="text-sm">
            종류
          </label>
          <select id="sub-kind" className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900" value={kind} onChange={(e) => setKind(e.target.value as FileKind)}>
            {FILE_KINDS.map((k) => (
              <option key={k} value={k}>
                {FILE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <label className="lift cursor-pointer rounded-full border border-zinc-400 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            파일 선택
            <input
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              aria-label="증빙 파일 선택"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {files.length > 0 && (
          <ul className="space-y-1 text-sm">
            {files.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-100 px-3 py-1.5 dark:bg-zinc-800">
                <span className="truncate">
                  <strong>{FILE_KIND_LABEL[f.kind]}</strong> · {f.file.name} ({mb(f.file.size)})
                </span>
                <button type="button" className="shrink-0 text-xs underline" onClick={() => setFiles((l) => l.filter((x) => x.key !== f.key))}>
                  빼기
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{CONSENT_TEXT}</span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="lift w-full rounded-full bg-black px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {busy ? step || "제출하는 중…" : "제출하기"}
      </button>
    </section>
  );
}
