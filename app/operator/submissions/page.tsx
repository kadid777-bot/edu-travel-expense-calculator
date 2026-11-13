import type { Metadata } from "next";
import OperatorNav from "../../../components/operator/OperatorNav";
import SubmissionList from "../../../components/operator/SubmissionList";

export const metadata: Metadata = {
  title: "제출 목록 | 스마트 교육여비 계산기",
  robots: { index: false, follow: false },
};

export default function SubmissionsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
      <OperatorNav current="submissions" />
      <h1 className="mb-2 text-2xl font-bold tracking-tight">제출 목록</h1>
      <p className="mb-6 text-sm text-[var(--md-on-surface-variant)]">교육생이 제출한 산출 내역과 증빙 파일이에요. 정산이 끝나면 삭제해 주세요.</p>
      <SubmissionList />
    </main>
  );
}
