"use client";

// 운영자 화면 위쪽 메뉴: 일괄 산출 / 제출 목록 / 로그아웃
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function OperatorNav({ current }: { current: "batch" | "submissions" }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/operator/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    router.push("/operator/login");
  }
  const base = "rounded-full px-4 py-2 text-sm transition-colors";
  const on = "bg-black text-white dark:bg-zinc-100 dark:text-zinc-900";
  const off = "hover:bg-zinc-200 dark:hover:bg-zinc-800";
  return (
    <nav aria-label="운영자 메뉴" className="mb-6 flex flex-wrap items-center gap-2">
      <Link href="/operator" className={`${base} ${current === "batch" ? on : off}`}>
        일괄 산출
      </Link>
      <Link href="/operator/submissions" className={`${base} ${current === "submissions" ? on : off}`}>
        제출 목록
      </Link>
      <Link href="/" className={`${base} ${off}`}>
        교육생 화면
      </Link>
      <button type="button" onClick={logout} className={`${base} ${off} ml-auto`}>
        로그아웃
      </button>
    </nav>
  );
}
