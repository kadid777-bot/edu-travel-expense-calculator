// Design Ref: §2.2 처리 4 — 구간 열차요금(일반실, 성인, 편도) 조회: 모든 교통수단의 상한
// API: 국토교통부(TAGO) 열차정보 — https://apis.data.go.kr/1613000/TrainInfo/GetStrtpntAlocFndTrainInfo
//   (출/도착역 + 날짜로 그날의 열차 시간표와 adultcharge(성인 일반실 요금)를 준다)
// 규칙(사용자 확정): 같은 구간에서 열차 종류별 요금이 다르면 "가장 높은 일반실 요금"을 상한으로 한다.
// 서버 전용: 인증키(DATA_GO_KR_TRAIN_KEY)를 쓴다.
import { findStations } from "../../data/stations";
import { fetchJson, memo } from "./http";

const BASE = "https://apis.data.go.kr/1613000/TrainInfo";
const FARE_TTL_MS = 60 * 60 * 1000;

interface TagoItem {
  adultcharge?: string | number;
  traingradename?: string;
}
interface TagoResponse {
  response?: { header?: { resultCode?: string }; body?: { items?: { item?: TagoItem | TagoItem[] } | "" } };
}

function toYmd(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function addDays(ymd: string, days: number): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

/** 응답에서 가장 높은 성인(일반실) 요금을 고른다. 없으면 null */
export function pickMaxFare(json: TagoResponse): number | null {
  const items = json.response?.body?.items;
  if (!items || typeof items === "string") return null;
  const list = Array.isArray(items.item) ? items.item : items.item ? [items.item] : [];
  const fares = list.map((i) => Number(i.adultcharge)).filter((n) => Number.isFinite(n) && n > 0);
  return fares.length > 0 ? Math.max(...fares) : null;
}

async function fareOnDate(depId: string, arrId: string, ymd: string): Promise<number | null> {
  const key = process.env.DATA_GO_KR_TRAIN_KEY;
  if (!key) return null;
  return memo(`tago:${depId}:${arrId}:${ymd}`, FARE_TTL_MS, async () => {
    const url = new URL(`${BASE}/GetStrtpntAlocFndTrainInfo`);
    url.searchParams.set("serviceKey", key);
    url.searchParams.set("_type", "json");
    url.searchParams.set("depPlaceId", depId);
    url.searchParams.set("arrPlaceId", arrId);
    url.searchParams.set("depPlandTime", ymd);
    url.searchParams.set("numOfRows", "300");
    const r = await fetchJson<TagoResponse>("TAGO 열차요금", url);
    return r.ok ? pickMaxFare(r.data) : null;
  });
}

export interface RailFare {
  fare: number;
  /** 실제로 요금을 조회한 날짜(YYYYMMDD). 교육일의 시간표가 아직 없으면 가까운 다음 날로 대신한다 */
  refDate: string;
  /** 요청한 날짜와 다르면 true */
  substituted: boolean;
}

/**
 * 두 지역 사이 열차요금 상한(가장 높은 일반실 요금)을 구한다. 대응 역이 없거나 같은 역이거나 조회 실패면 null.
 * 교육일이 TAGO 시간표 제공 범위(대략 한 달 안팎)를 넘어서면 결과가 비어서, 내일 날짜로 한 번 더 시도한다.
 */
export async function getRailFareCap(
  from: { sido: string; sigungu: string },
  to: { sido: string; sigungu: string },
  isoDate: string,
): Promise<RailFare | null> {
  const dep = findStations(from.sido, from.sigungu);
  const arr = findStations(to.sido, to.sigungu);
  if (!dep.railId || !arr.railId || dep.railId === arr.railId) return null;

  const wanted = toYmd(isoDate);
  const exact = await fareOnDate(dep.railId, arr.railId, wanted);
  if (exact !== null) return { fare: exact, refDate: wanted, substituted: false };

  const tomorrow = addDays(new Date().toISOString().slice(0, 10).replaceAll("-", ""), 1);
  if (tomorrow === wanted) return null;
  const alt = await fareOnDate(dep.railId, arr.railId, tomorrow);
  return alt !== null ? { fare: alt, refDate: tomorrow, substituted: true } : null;
}
