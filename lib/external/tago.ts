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

/** 열차 종류(KTX·무궁화호 등)별 가장 높은 일반실 성인 요금표 (요금 높은 순) */
export function pickFaresByGrade(json: TagoResponse): { grade: string; fare: number }[] {
  const items = json.response?.body?.items;
  if (!items || typeof items === "string") return [];
  const list = Array.isArray(items.item) ? items.item : items.item ? [items.item] : [];
  const best = new Map<string, number>();
  for (const i of list) {
    const fare = Number(i.adultcharge);
    if (!Number.isFinite(fare) || fare <= 0) continue;
    const grade = (i.traingradename ?? "").trim() || "열차";
    best.set(grade, Math.max(best.get(grade) ?? 0, fare));
  }
  return [...best].map(([grade, fare]) => ({ grade, fare })).sort((a, b) => b.fare - a.fare);
}

interface FareLookup {
  max: number;
  grades: { grade: string; fare: number }[];
}

async function fareOnDate(depId: string, arrId: string, ymd: string): Promise<FareLookup | null> {
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
    if (!r.ok) return null;
    const max = pickMaxFare(r.data);
    return max === null ? null : { max, grades: pickFaresByGrade(r.data) };
  });
}

/** 역 사이(출발역→도착역) 한 구간의 요금 조회 결과 */
export interface RailRoute {
  depStation: string;
  arrStation: string;
  /** 그 역 사이에서 가장 높은 일반실 성인 요금 */
  fare: number;
  grades: { grade: string; fare: number }[];
}

export interface RailFare {
  /** 교통비 상한 = 조회된 역 조합 중 가장 높은 일반실 요금 */
  fare: number;
  /** 실제로 요금을 조회한 날짜(YYYYMMDD). 교육일의 시간표가 아직 없으면 가까운 다음 날로 대신한다 */
  refDate: string;
  /** 요청한 날짜와 다르면 true */
  substituted: boolean;
  /** 직접 확인용: 상한이 된 역 구간의 열차 종류별 요금표와 출발·도착역 */
  grades: { grade: string; fare: number }[];
  depStation: string;
  arrStation: string;
  /** 직접 확인용: 조회한 모든 역 조합의 최고 요금(요금 높은 순). 서울처럼 역이 여럿이면 2개 이상 */
  routes: RailRoute[];
}

/** 두 지역의 철도역 대응 상태: 문제가 없으면 null */
export function railStationIssue(
  from: { sido: string; sigungu: string },
  to: { sido: string; sigungu: string },
): "no-station" | "same-station" | null {
  const dep = findStations(from.sido, from.sigungu);
  const arr = findStations(to.sido, to.sigungu);
  if (!dep.railId || !arr.railId) return "no-station";
  return dep.railId === arr.railId ? "same-station" : null;
}

/** 그 지역에서 이용할 수 있는 역들. 서울은 서울역·용산역·수서역을 모두 본다 */
function stationsOf(p: ReturnType<typeof findStations>): { rail: string; railId: string }[] {
  return p.group ?? [{ rail: p.rail ?? "", railId: p.railId ?? "" }];
}

/**
 * 두 지역 사이 열차요금 상한을 구한다: 이용할 수 있는 역 조합들의 일반실(성인, 편도) 요금 중 **가장 높은 금액**.
 * (서울은 서울역·용산역·수서역 모두, 열차 종류가 달라 요금이 다르면 그중에서도 가장 높은 요금)
 * 대응 역이 없거나 같은 역이거나 조회 실패면 null.
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

  const combos = stationsOf(dep).flatMap((d) => stationsOf(arr).map((a) => ({ d, a }))).filter((c) => c.d.railId !== c.a.railId);

  /** 모든 역 조합을 조회해 가장 높은 요금을 고른다. 하나도 없으면 null */
  async function bestOn(ymdDate: string) {
    const hits = (
      await Promise.all(
        combos.map(async (c) => {
          const hit = await fareOnDate(c.d.railId, c.a.railId, ymdDate);
          return hit ? ({ depStation: c.d.rail, arrStation: c.a.rail, fare: hit.max, grades: hit.grades } satisfies RailRoute) : null;
        }),
      )
    ).filter((h): h is RailRoute => h !== null);
    if (hits.length === 0) return null;
    const routes = hits.sort((x, y) => y.fare - x.fare);
    return { best: routes[0], routes };
  }

  const wanted = toYmd(isoDate);
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  // 시간표 제공 범위(약 한 달)를 넘는 날짜는 거의 빈 결과라 처음부터 건너뛴다
  if (wanted <= addDays(today, 30)) {
    const exact = await bestOn(wanted);
    if (exact) {
      return { fare: exact.best.fare, grades: exact.best.grades, depStation: exact.best.depStation, arrStation: exact.best.arrStation, routes: exact.routes, refDate: wanted, substituted: false };
    }
  }

  const tomorrow = addDays(today, 1);
  if (tomorrow === wanted) return null;
  const alt = await bestOn(tomorrow);
  return alt
    ? { fare: alt.best.fare, grades: alt.best.grades, depStation: alt.best.depStation, arrStation: alt.best.arrStation, routes: alt.routes, refDate: tomorrow, substituted: true }
    : null;
}
