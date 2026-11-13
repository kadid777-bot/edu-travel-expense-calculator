import type { Metadata } from "next";
import BatchUpload from "../../components/operator/BatchUpload";
import OperatorNav from "../../components/operator/OperatorNav";

export const metadata: Metadata = {
  title: "운영자 일괄 산출 | 스마트 교육여비 계산기",
  robots: { index: false, follow: false },
};

export default function OperatorPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
      <OperatorNav current="batch" />
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">운영자 일괄 산출</h1>
        <p className="mt-2 text-[var(--md-on-surface-variant)]">
          교육생 명단을 한 번에 계산해요. 여기에 입력한 명단은 서버에 저장되지 않아요(교육생이 제출한 내역은 &quot;제출 목록&quot;에서 봐요).
        </p>
      </header>
      <BatchUpload />
    </main>
  );
}
