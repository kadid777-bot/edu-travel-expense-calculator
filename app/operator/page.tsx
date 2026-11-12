import type { Metadata } from "next";
import Link from "next/link";
import BatchUpload from "../../components/operator/BatchUpload";

export const metadata: Metadata = {
  title: "운영자 일괄 산출 | 스마트 교육여비 계산기",
  robots: { index: false, follow: false },
};

export default function OperatorPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">운영자 일괄 산출</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          교육생 명단을 한 번에 계산해요. 입력한 명단은 서버에 저장되지 않아요.{" "}
          <Link href="/" className="underline">
            교육생 화면으로
          </Link>
        </p>
      </header>
      <BatchUpload />
    </main>
  );
}
