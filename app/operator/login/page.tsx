import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "../../../components/operator/LoginForm";

export const metadata: Metadata = {
  title: "운영자 로그인 | 스마트 교육여비 계산기",
  robots: { index: false, follow: false },
};

export default function OperatorLoginPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
      <h1 className="mb-6 text-center text-2xl font-bold tracking-tight">운영자 로그인</h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
