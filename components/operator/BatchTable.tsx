"use client";

// Design Ref: §5.3 운영자 화면 — 교육생별 항목 금액·합계·경고 표와 결과 내려받기
import { toCsv } from "../../lib/calc/batch";
import { CATEGORIES_ORDER, type BatchOutcome } from "./types";

export default function BatchTable({ outcomes, names }: { outcomes: BatchOutcome[]; names: Record<number, string> }) {
  function download() {
    const head = ["번호", "이름", ...CATEGORIES_ORDER, "합계", "경고·오류"];
    const body = outcomes.map((o) => [
      o.rowNo,
      names[o.rowNo] ?? "",
      ...CATEGORIES_ORDER.map((c) => o.result?.items.find((i) => i.category === c)?.approved ?? ""),
      o.result?.total ?? "",
      o.error ? o.error.message : (o.result?.warnings ?? []).join(" | "),
    ]);
    const blob = new Blob([toCsv([head, ...body])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "교육여비_일괄산출_결과.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const sum = outcomes.reduce((s, o) => s + (o.result?.total ?? 0), 0);
  return (
    <section aria-label="일괄 산출 결과" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          결과 {outcomes.length}명 · 합계 {sum.toLocaleString("ko-KR")}원
        </h3>
        <button
          type="button"
          onClick={download}
          className="rounded border border-zinc-400 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          결과 내려받기(CSV)
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left dark:border-zinc-700">
              <th className="p-2">번호</th>
              <th className="p-2">이름</th>
              {CATEGORIES_ORDER.map((c) => (
                <th key={c} className="p-2 text-right">
                  {c}
                </th>
              ))}
              <th className="p-2 text-right">합계</th>
              <th className="p-2">경고·오류</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => (
              <tr key={o.rowNo} className="border-b border-zinc-200 align-top dark:border-zinc-800">
                <td className="p-2">{o.rowNo}</td>
                <td className="p-2">{names[o.rowNo]}</td>
                {CATEGORIES_ORDER.map((c) => (
                  <td key={c} className="p-2 text-right">
                    {o.result ? (o.result.items.find((i) => i.category === c)?.approved ?? 0).toLocaleString("ko-KR") : "-"}
                  </td>
                ))}
                <td className="p-2 text-right font-semibold">{o.result ? o.result.total.toLocaleString("ko-KR") : "-"}</td>
                <td className="p-2 text-amber-700 dark:text-amber-400">
                  {o.error ? o.error.message : (o.result?.warnings ?? []).join(" / ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
