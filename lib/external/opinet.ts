// Design Ref: §2.2 처리 4 — 전국 주유소 보통휘발유 평균 판매가격(원/L): 오피넷 오픈 API
// API: https://www.opinet.co.kr/api/avgAllPrice.do (인증키 파라미터 이름은 code)
// 한계: 오늘 값(avgAllPrice) 외에 날짜별 값은 최근 7일(avgRecentPrice)뿐이라 과거·미래의 임의 날짜 가격은 없다.
//       기간을 고르면 그 안에서 오피넷이 주는 날짜만 평균 낸다(아래 getGasolineForPeriod).
//       그래서 출장 당일 가격이 아니라 조회한 날(TRADE_DT 기준일)의 전국 평균가를 쓴다.
// 서버 전용: 인증키(OPINET_API_KEY)를 쓴다.
import { fetchJson, memo } from "./http";

const URL_AVG = "https://www.opinet.co.kr/api/avgAllPrice.do";
const PRICE_TTL_MS = 30 * 60 * 1000;
const REGULAR_GASOLINE = "B027"; // 보통휘발유

interface OpinetResponse {
  RESULT?: { OIL?: { TRADE_DT?: string; PRODCD?: string; PRICE?: string }[] };
}

export interface GasolinePrice {
  price: number; // 원/L
  tradeDate: string; // YYYYMMDD (오피넷 기준일)
}

export function pickGasoline(json: OpinetResponse): GasolinePrice | null {
  const row = json.RESULT?.OIL?.find((o) => o.PRODCD === REGULAR_GASOLINE);
  const price = Number(row?.PRICE);
  if (!row || !Number.isFinite(price) || price <= 0) return null;
  return { price, tradeDate: row.TRADE_DT ?? "" };
}

export async function getGasolinePrice(): Promise<GasolinePrice | null> {
  const key = process.env.OPINET_API_KEY;
  if (!key) return null;
  return memo("opinet:avg", PRICE_TTL_MS, async () => {
    const url = new URL(URL_AVG);
    url.searchParams.set("out", "json");
    url.searchParams.set("code", key);
    const r = await fetchJson<OpinetResponse>("오피넷 평균가", url);
    return r.ok ? pickGasoline(r.data) : null;
  });
}

// ── 기간을 골라 평균 내기 ──────────────────────────────────────────────────────────────
// 오피넷 오픈 API가 주는 날짜별 전국 평균가는 "최근 7일(어제까지)"뿐이고, 오늘 값은 avgAllPrice가 준다.
// 그래서 교육생이 고른 기간 중 오피넷이 제공하는 날짜만 평균 내고, 제공하지 않는 날은 쓰지 않는다(지어내지 않는다).
const URL_RECENT = "https://www.opinet.co.kr/api/avgRecentPrice.do";

interface RecentResponse {
  RESULT?: { OIL?: { DATE?: string; PRODCD?: string; PRICE?: number | string }[] };
}

export interface DailyPrice {
  date: string; // YYYYMMDD
  price: number;
}

export function pickDaily(json: RecentResponse): DailyPrice[] {
  const rows = json.RESULT?.OIL ?? [];
  const out: DailyPrice[] = [];
  for (const r of rows) {
    const price = Number(r.PRICE);
    if (r.PRODCD === REGULAR_GASOLINE && r.DATE && Number.isFinite(price) && price > 0) out.push({ date: r.DATE, price });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 오피넷이 제공하는 날짜별 전국 평균가: 최근 7일 + 오늘(avgAllPrice) */
export async function getGasolineHistory(): Promise<DailyPrice[] | null> {
  const key = process.env.OPINET_API_KEY;
  if (!key) return null;
  const recent = await memo("opinet:recent", PRICE_TTL_MS, async () => {
    const url = new URL(URL_RECENT);
    url.searchParams.set("out", "json");
    url.searchParams.set("code", key);
    url.searchParams.set("prodcd", REGULAR_GASOLINE);
    const r = await fetchJson<RecentResponse>("오피넷 최근 가격", url);
    if (!r.ok) return null;
    const list = pickDaily(r.data);
    return list.length > 0 ? list : null;
  });
  const today = await getGasolinePrice();
  const days = [...(recent ?? [])];
  if (today?.tradeDate && !days.some((d) => d.date === today.tradeDate)) days.push({ date: today.tradeDate, price: today.price });
  return days.length > 0 ? days.sort((a, b) => a.date.localeCompare(b.date)) : null;
}

export interface PeriodGasoline {
  /** 고른 기간 중 오피넷이 제공하는 날짜들의 전국 평균가 평균(원/L, 소수 둘째 자리) */
  price: number;
  days: DailyPrice[];
  /** 고른 기간의 날짜 수 */
  requestedDays: number;
}

function ymdToUtc(s: string): number {
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
}

/** 기간(YYYYMMDD) 안에서 오피넷이 제공하는 날짜가 하나도 없으면 null */
export function averageForPeriod(history: DailyPrice[], start: string, end: string): PeriodGasoline | null {
  const days = history.filter((d) => d.date >= start && d.date <= end);
  if (days.length === 0) return null;
  const avg = days.reduce((s, d) => s + d.price, 0) / days.length;
  return { price: Math.round(avg * 100) / 100, days, requestedDays: Math.round((ymdToUtc(end) - ymdToUtc(start)) / 86_400_000) + 1 };
}

export async function getGasolineForPeriod(start: string, end: string): Promise<PeriodGasoline | null> {
  const history = await getGasolineHistory();
  return history ? averageForPeriod(history, start, end) : null;
}
