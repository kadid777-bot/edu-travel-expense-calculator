// 증빙 화면 만들기 — 네이버 지도 경로 조회 결과와 오피넷 전국 평균 휘발유 가격을 "캡처해서 그대로 제출할 수 있는" 이미지(SVG)로 그린다.
// 같은 SVG를 화면에 보여주고 PNG로도 저장하므로, 화면과 저장된 파일이 같다.
// 주의: 네이버·오피넷 홈페이지 화면을 그대로 복사한 것이 아니라, 두 서비스의 API에서 조회한 값을 같은 정보로 표시한 화면이다.

export interface RouteEvidence {
  label: string; // "가는 편" | "오는 편"
  fromName: string;
  toName: string;
  distanceKm: number;
  durationMin: number | null;
  tollFare: number | null;
  path: [number, number][];
  start: [number, number];
  goal: [number, number];
  fetchedAt: string; // ISO
}

export interface GasolineEvidence {
  price: number;
  tradeDate: string; // YYYYMMDD
  fetchedAt: string; // ISO
  /** 교육생이 기간을 골랐을 때: 평균에 쓴 날짜별 가격 (고른 기간 안에 오피넷 제공 날짜가 없으면 days가 비고 fellBack) */
  period?: { startDate: string; endDate: string; days: { date: string; price: number }[]; requestedDays: number; fellBack: boolean };
}

export const ROUTE_SVG_SIZE = { width: 900, height: 640 };
export const GASOLINE_SVG_WIDTH = 900;

/** 기간 평균이면 날짜별 가격 표만큼 카드가 길어진다 */
export function gasolineSvgSize(e: GasolineEvidence): { width: number; height: number } {
  const rows = e.period && !e.period.fellBack ? e.period.days.length : 0;
  return { width: GASOLINE_SVG_WIDTH, height: 340 + (rows > 0 ? 30 + rows * 24 : 0) };
}

const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatKoTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR");
}

const won2 = (n: number) => n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatYmd(s: string): string {
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

function hm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

/** 경도·위도 점들을 (x, y) 칸 안에 맞춰 그린다. 위도 1도와 경도 1도의 길이 차이를 보정한다 */
export function projectPoints(
  points: [number, number][],
  box: { x: number; y: number; w: number; h: number },
  pad = 28,
): [number, number][] {
  if (points.length === 0) return [];
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * k, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((box.w - pad * 2) / spanX, (box.h - pad * 2) / spanY);
  const offX = box.x + (box.w - spanX * scale) / 2;
  const offY = box.y + (box.h - spanY * scale) / 2;
  return points.map(([lng, lat]) => [offX + (lng - minLng) * k * scale, offY + (maxLat - lat) * scale]);
}

export function routeEvidenceSvg(e: RouteEvidence): string {
  const { width: W, height: H } = ROUTE_SVG_SIZE;
  const map = { x: 20, y: 64, w: 860, h: 340 };
  const line = e.path.length >= 2 ? e.path : [e.start, e.goal];
  const pts = projectPoints([...line, e.start, e.goal], map);
  const route = pts.slice(0, line.length);
  const [sx, sy] = pts[line.length];
  const [gx, gy] = pts[line.length + 1];
  const poly = route.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const labelRight = (x: number) => x < map.x + map.w - 150;
  const tag = (x: number, y: number, text: string, fill: string) =>
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${fill}" stroke="#fff" stroke-width="3"/>` +
    `<text x="${(labelRight(x) ? x + 16 : x - 16).toFixed(1)}" y="${(y + 5).toFixed(1)}" font-size="16" font-weight="700" fill="#111" text-anchor="${labelRight(x) ? "start" : "end"}" stroke="#eef0f2" stroke-width="4" paint-order="stroke">${text}</text>`;
  const sub = [
    e.durationMin !== null ? `예상 소요 ${hm(e.durationMin)}` : "",
    e.tollFare !== null ? `통행료(네이버 계산) ${e.tollFare.toLocaleString("ko-KR")}원` : "",
    "경로 옵션: 최적 경로",
  ]
    .filter(Boolean)
    .join("  ·  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<rect width="${W}" height="48" fill="#03c75a"/>
<text x="20" y="31" font-size="20" font-weight="700" fill="#ffffff">네이버 지도 · 자동차 경로 조회 결과</text>
<text x="${W - 20}" y="31" font-size="14" fill="#ffffff" text-anchor="end">Maps Directions 5 API</text>
<rect x="${map.x}" y="${map.y}" width="${map.w}" height="${map.h}" rx="8" fill="#eef0f2" stroke="#d5d9dd"/>
<polyline points="${poly}" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
<polyline points="${poly}" fill="none" stroke="#03a94d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
${tag(sx, sy, "출발", "#1f6feb")}
${tag(gx, gy, "도착", "#d1242f")}
<text x="20" y="440" font-size="16" fill="#555">${esc(e.label)}</text>
<text x="20" y="470" font-size="22" font-weight="700" fill="#111">${esc(e.fromName)}  →  ${esc(e.toName)}</text>
<text x="20" y="540" font-size="20" fill="#555">자동차 거리</text>
<text x="180" y="544" font-size="56" font-weight="800" fill="#111">${e.distanceKm}<tspan font-size="28" font-weight="700"> km</tspan></text>
<text x="20" y="578" font-size="16" fill="#333">${esc(sub)}</text>
<line x1="20" y1="596" x2="${W - 20}" y2="596" stroke="#e1e4e8"/>
<text x="20" y="615" font-size="13" fill="#666">조회 시각 ${esc(formatKoTime(e.fetchedAt))}  ·  출처 네이버 클라우드 플랫폼 Maps Directions 5</text>
<text x="20" y="632" font-size="12" fill="#888">시·군·구 대표 위치 기준 (출발 ${e.start[0]}, ${e.start[1]} / 도착 ${e.goal[0]}, ${e.goal[1]} · 경도, 위도)</text>
</svg>`;
}

export function gasolineEvidenceSvg(e: GasolineEvidence): string {
  const { width: W, height: H } = gasolineSvgSize(e);
  const p = e.period && !e.period.fellBack ? e.period : null;
  const days = p ? p.days : [];
  const tableTop = 262;
  const rows = days
    .map(
      (d, i) =>
        `<text x="40" y="${tableTop + 22 + i * 24}" font-size="16" fill="#333">${esc(formatYmd(d.date))}</text><text x="260" y="${tableTop + 22 + i * 24}" font-size="16" fill="#111" text-anchor="end">${won2(d.price)} 원/L</text>`,
    )
    .join("");
  const baseY = days.length > 0 ? tableTop + 30 + days.length * 24 : 236;
  const headline = p ? `보통휘발유  (선택 기간 ${esc(p.startDate)} ~ ${esc(p.endDate)} 평균)` : "보통휘발유  (전국 주유소 평균)";
  const line1 = p
    ? `오피넷이 제공하는 ${p.days.length}일의 전국 평균가를 평균했습니다.`
    : `기준일 ${esc(formatYmd(e.tradeDate))}`;
  const line2 = p
    ? p.days.length < p.requestedDays
      ? "오피넷 오픈 API는 최근 7일과 오늘 가격만 제공해, 선택 기간 중 제공되는 날짜만 사용했습니다."
      : "선택한 기간의 모든 날짜가 오피넷 제공 범위입니다."
    : e.period?.fellBack
      ? "선택한 기간의 가격은 오피넷이 제공하지 않아(최근 7일과 오늘만 제공) 조회일 전국 평균가를 사용했습니다."
      : "오피넷 오픈 API는 날짜별 가격을 주지 않아 조회한 날의 전국 평균가를 사용합니다.";
  const footerLine = baseY + 56;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<rect width="${W}" height="48" fill="#0b5cab"/>
<text x="20" y="31" font-size="20" font-weight="700" fill="#ffffff">오피넷 · 전국 평균 판매가격</text>
<text x="${W - 20}" y="31" font-size="14" fill="#ffffff" text-anchor="end">한국석유공사 오피넷 오픈 API</text>
<text x="20" y="100" font-size="20" fill="#555">${headline}</text>
<text x="20" y="190" font-size="84" font-weight="800" fill="#111">${won2(e.price)}<tspan font-size="32" font-weight="700"> 원/L</tspan></text>
<text x="20" y="236" font-size="20" fill="#333">${line1}</text>
${rows}
<text x="20" y="${baseY + 8}" font-size="15" fill="#555">${esc(line2)}</text>
<line x1="20" y1="${footerLine - 24}" x2="${W - 20}" y2="${footerLine - 24}" stroke="#e1e4e8"/>
<text x="20" y="${footerLine + 4}" font-size="13" fill="#666">조회 시각 ${esc(formatKoTime(e.fetchedAt))}  ·  출처 한국석유공사 오피넷(opinet.co.kr) 오픈 API 전국 평균 판매가격</text>
</svg>`;
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** SVG를 2배 해상도 PNG로 바꾼다 (브라우저 전용) */
export function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("이미지를 만들 수 없습니다"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지를 만들 수 없습니다"))), "image/png");
    };
    img.onerror = () => reject(new Error("이미지를 만들 수 없습니다"));
    img.src = svgDataUrl(svg);
  });
}
