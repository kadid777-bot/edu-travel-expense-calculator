import type { Metadata } from "next";
import { Suspense } from "react";
import OperatorNav from "../../../components/operator/OperatorNav";
import SubmissionDetail from "../../../components/operator/SubmissionDetail";

export const metadata: Metadata = {
  title: "제출 상세 | 스마트 교육여비 계산기",
  robots: { index: false, follow: false },
};

export default function SubmissionPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
      <OperatorNav current="submissions" />
      <Suspense fallback={<p>불러오는 중…</p>}>
        <SubmissionDetail />
      </Suspense>
    </main>
  );
}
