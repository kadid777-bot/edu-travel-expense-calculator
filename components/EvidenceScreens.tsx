"use client";

// 증빙 화면: 네이버 지도 구간 거리와 오피넷 전국 평균 휘발유 가격을 화면에서 바로 보고, 캡처하거나 PNG로 저장해 제출한다
import { useState } from "react";
import {
  gasolineSvgSize,
  ROUTE_SVG_SIZE,
  gasolineEvidenceSvg,
  routeEvidenceSvg,
  svgDataUrl,
  svgToPngBlob,
} from "../lib/evidence-image";
import type { LookupEvidence } from "../lib/external/lookups";

function ScreenCard({
  title,
  svg,
  size,
  fileName,
}: {
  title: string;
  svg: string;
  size: { width: number; height: number };
  fileName: string;
}) {
  const [error, setError] = useState("");

  async function save() {
    setError("");
    try {
      const blob = await svgToPngBlob(svg, size.width, size.height);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("이미지로 저장하지 못했습니다. 화면을 직접 캡처해 주세요");
    }
  }

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <button
          type="button"
          onClick={save}
          className="lift rounded-full border border-[var(--md-outline-variant)] px-3 py-1 text-xs hover:bg-[var(--md-container-high)]"
        >
          이미지(PNG)로 저장
        </button>
      </figcaption>
      {/* 흰 바탕 카드: 어두운 화면 설정에서도 캡처했을 때 그대로 제출할 수 있다 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={svgDataUrl(svg)} alt={title} className="w-full rounded-2xl border border-[var(--md-outline-variant)] bg-[var(--md-lowest)]" />
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </figure>
  );
}

export default function EvidenceScreens({ evidence, fetchedAt }: { evidence: LookupEvidence; fetchedAt: string }) {
  const cars = evidence.legs.filter((l) => l.car);
  if (cars.length === 0 && !evidence.gasoline) return null;
  return (
    <section aria-label="증빙 화면" className="space-y-4">
      <h3 className="font-semibold">증빙 화면 (캡처·이미지 저장용)</h3>
      <p className="text-xs text-[var(--md-on-surface-variant)]">
        네이버 지도와 오피넷을 다시 열어 조회하지 않아도, 아래 화면을 캡처하거나 &quot;이미지(PNG)로 저장&quot;해서 증빙으로 낼 수 있어요. 앱이 두 서비스의 API에서 조회한
        값을 같은 정보로 보여주는 화면이고, 홈페이지 화면을 그대로 복사한 것은 아니에요. 제출처가 홈페이지 화면을 꼭 요구하면 위의 바로가기 링크를 쓰세요.
      </p>
      {cars.map((leg) => {
        const car = leg.car!;
        const svg = routeEvidenceSvg({
          label: leg.label,
          fromName: leg.from,
          toName: leg.to,
          distanceKm: car.distanceKm,
          durationMin: car.durationMin,
          tollFare: car.tollFare,
          path: car.path,
          start: car.start,
          goal: car.goal,
          fetchedAt,
        });
        return (
          <ScreenCard
            key={leg.label}
            title={`네이버 지도 경로 조회 — ${leg.label}`}
            svg={svg}
            size={ROUTE_SVG_SIZE}
            fileName={`증빙_네이버지도_${leg.label.replace(" ", "")}.png`}
          />
        );
      })}
      {evidence.gasoline && (() => {
        const g = { price: evidence.gasoline.price, tradeDate: evidence.gasoline.tradeDate, fetchedAt, period: evidence.gasoline.period };
        return (
          <ScreenCard
            title="오피넷 전국 평균 휘발유 가격"
            svg={gasolineEvidenceSvg(g)}
            size={gasolineSvgSize(g)}
            fileName="증빙_오피넷_전국평균휘발유.png"
          />
        );
      })()}
    </section>
  );
}
