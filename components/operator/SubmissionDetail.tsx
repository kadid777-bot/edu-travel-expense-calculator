"use client";

// Design Ref: docs/SUBMISSION-DESIGN.md §4 — 운영자 제출 상세: 산출 내역·조회 근거·증빙 파일
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FILE_KIND_LABEL, type Submission } from "../../lib/submissions/types";
import ResultCard from "../ResultCard";

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

export default function SubmissionDetail() {
  const id = useSearchParams().get("id") ?? "";
  const [sub, setSub] = useState<Submission | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/operator/submissions/${encodeURIComponent(id)}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) setError(json?.error?.message ?? "불러오지 못했습니다");
        else setSub(json.data);
      } catch {
        if (alive) setError("서버에 연결하지 못했습니다");
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) return <p role="alert" className="text-red-700 dark:text-red-400">{error}</p>;
  if (!sub) return <p>불러오는 중…</p>;

  const c = sub.input.customCourse;
  return (
    <div className="space-y-8">
      <Link href="/operator/submissions" className="text-sm underline">
        ← 제출 목록
      </Link>

      <section aria-label="제출 정보" className="grid gap-x-8 gap-y-1 rounded-2xl bg-[var(--md-container-high)] p-4 text-sm sm:grid-cols-2">
        <p><span className="text-[var(--md-on-surface-variant)]">접수 번호 </span><strong>{sub.id}</strong></p>
        <p><span className="text-[var(--md-on-surface-variant)]">제출 시각 </span>{new Date(sub.createdAt).toLocaleString("ko-KR")}</p>
        <p><span className="text-[var(--md-on-surface-variant)]">이름·사번 </span>{sub.submitter.name} · {sub.submitter.employeeNo}</p>
        <p><span className="text-[var(--md-on-surface-variant)]">개인정보 동의 </span>{new Date(sub.consent.agreedAt).toLocaleString("ko-KR")}</p>
        {c && (
          <>
            <p><span className="text-[var(--md-on-surface-variant)]">교육 장소 </span>{c.venueSido} {c.venueSigungu}</p>
            <p><span className="text-[var(--md-on-surface-variant)]">교육 기간 </span>{c.startDate} ~ {c.endDate}</p>
          </>
        )}
        <p><span className="text-[var(--md-on-surface-variant)]">가는 편 </span>{sub.input.outbound.sido} {sub.input.outbound.sigungu} ({sub.input.outbound.transport}, 입력 {(sub.input.outbound.transportActual ?? sub.input.outbound.tollActual ?? 0).toLocaleString("ko-KR")}원)</p>
        <p><span className="text-[var(--md-on-surface-variant)]">오는 편 </span>{sub.input.inbound.sido} {sub.input.inbound.sigungu} ({sub.input.inbound.transport}, 입력 {(sub.input.inbound.transportActual ?? sub.input.inbound.tollActual ?? 0).toLocaleString("ko-KR")}원)</p>
        <p><span className="text-[var(--md-on-surface-variant)]">숙박 </span>{sub.input.nights}박 {(sub.input.lodgingActuals ?? []).map((n) => n.toLocaleString("ko-KR")).join(" / ")}</p>
        <p><span className="text-[var(--md-on-surface-variant)]">식비 청구 일수 </span>{sub.input.mealDays ?? 0}일</p>
      </section>

      <ResultCard result={sub.result} meta={{ mockLookups: false, fetchedAt: sub.meta.fetchedAt, notes: sub.meta.notes, evidence: sub.meta.evidence as never }} />

      <section aria-label="증빙 파일" className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">증빙 파일 {sub.files.length}개</h2>
        {sub.files.length === 0 && <p className="text-sm text-[var(--md-on-surface-variant)]">올린 증빙이 없어요</p>}
        <ul className="grid gap-4 sm:grid-cols-2">
          {sub.files.map((f) => {
            const src = `/api/operator/files/${sub.id}/${f.id}`;
            return (
              <li key={f.id} className="space-y-2 rounded-2xl border border-[var(--md-outline-variant)] p-3">
                <p className="text-sm">
                  <strong>{FILE_KIND_LABEL[f.kind]}</strong> · {f.name} ({mb(f.size)})
                </p>
                {f.contentType.startsWith("image/") && f.contentType !== "image/heic" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={`${FILE_KIND_LABEL[f.kind]} ${f.name}`} className="max-h-72 w-full rounded border border-[var(--md-outline-variant)] object-contain" />
                ) : (
                  <p className="text-xs text-[var(--md-on-surface-variant)]">{f.contentType === "application/pdf" ? "PDF 파일" : "미리보기를 지원하지 않는 형식"}이에요. 열거나 내려받아 확인하세요.</p>
                )}
                <div className="flex gap-3 text-sm">
                  <a className="underline" href={src} target="_blank" rel="noopener noreferrer">열기</a>
                  <a className="underline" href={`${src}?download=1`}>내려받기</a>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
