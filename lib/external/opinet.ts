// Design Ref: §2.2 처리 4 — 전국 주유소 보통휘발유 평균 판매가격(원/L): 오피넷 오픈 API
// API: https://www.opinet.co.kr/api/avgAllPrice.do (인증키 파라미터 이름은 code)
// 한계: 오피넷 오픈 API에는 "날짜별 과거/미래 가격"이 없고 "현재" 평균가만 있다.
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
