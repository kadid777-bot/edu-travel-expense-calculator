"use client";

// Design Ref: §5.1 증빙 사진 미리보기 (nice) — 사진은 이 브라우저 화면에서만 보여주고 서버로 보내지 않는다(저장 없음)
import { useEffect, useState } from "react";

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

interface Preview {
  name: string;
  url: string;
}

export default function EvidenceUpload() {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return () => previews.forEach((p) => URL.revokeObjectURL(p.url));
  }, [previews]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setMessage("");
    const ok = files.filter((f) => f.type.startsWith("image/") && f.size <= MAX_BYTES).slice(0, MAX_FILES);
    if (ok.length < files.length) {
      setMessage(`이미지 파일만, 파일당 5MB 이하, 최대 ${MAX_FILES}장까지 확인할 수 있어요`);
    }
    setPreviews(ok.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })));
  }

  return (
    <fieldset className="space-y-2 rounded border border-zinc-300 p-4 dark:border-zinc-700">
      <legend className="px-1 text-sm font-medium">증빙 사진 확인 (선택)</legend>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        영수증·승차권 사진을 올려 입력한 금액과 맞는지 눈으로 비교할 수 있어요. 사진은 이 화면에서만 보이고 서버로 보내거나 저장하지 않아요.
      </p>
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
        카드번호·주민등록번호 등 개인정보가 보이면 가린 사진을 올려 주세요.
      </p>
      <input type="file" accept="image/*" multiple onChange={onChange} className="text-sm" aria-label="증빙 사진 선택" />
      {message && (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
          {message}
        </p>
      )}
      {previews.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {previews.map((p) => (
            <li key={p.url} className="w-28 text-xs">
              {/* 브라우저 안의 임시 주소라 next/image를 쓰지 않는다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`증빙 사진 ${p.name}`} className="h-28 w-28 rounded border border-zinc-300 object-cover dark:border-zinc-700" />
              <span className="mt-1 block truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
