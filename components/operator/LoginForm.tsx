"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/operator/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "로그인하지 못했습니다");
        return;
      }
      // 돌아갈 곳은 /operator 아래의 주소만 허용한다(다른 사이트로 보내지 않는다)
      const next = params.get("next") ?? "";
      router.push(/^\/operator(\/|$)/.test(next) && !next.startsWith("//") ? next : "/operator/submissions");
    } catch {
      setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4">
      <div>
        <label htmlFor="op-password" className="mb-1 block text-sm font-medium">
          운영자 비밀번호
        </label>
        <input
          id="op-password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || password === ""} className="lift w-full rounded-full bg-black px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900">
        {busy ? "확인하는 중…" : "로그인"}
      </button>
    </form>
  );
}
