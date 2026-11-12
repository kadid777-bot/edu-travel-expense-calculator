// Design Ref: §2.2 처리 4 — 두 시·군·구 사이 자동차 거리(km): 네이버 지도 Directions 5
// API: https://maps.apigw.ntruss.com/map-direction/v1/driving (start/goal = 경도,위도)
// 좌표는 data/coords.ts의 시·군·구 대표 좌표를 쓴다(Geocoding 권한이 없어도 동작).
// 서버 전용: 인증키(NAVER_MAPS_DIRECTIONS_ID / _SECRET)를 쓴다.
import { getCoord } from "../../data/coords";
import { fetchJson, memo } from "./http";

const URL_DRIVING = "https://maps.apigw.ntruss.com/map-direction/v1/driving";
const DISTANCE_TTL_MS = 24 * 60 * 60 * 1000;

interface DirectionsResponse {
  code?: number;
  route?: {
    traoptimal?: {
      summary?: { distance?: number; duration?: number; tollFare?: number };
      path?: [number, number][];
    }[];
  };
}

/** 화면에 그릴 경로 (증빙 화면용). 점이 수천 개라 maxPoints개로 줄여서 보낸다 */
export interface DrivingRoute {
  distanceKm: number;
  durationMin: number | null;
  /** 네이버가 계산한 통행료(원). 참고용이며 자차 교통비 계산에는 교육생이 입력한 하이패스 실비를 쓴다 */
  tollFare: number | null;
  path: [number, number][];
  start: [number, number];
  goal: [number, number];
}

const MAX_PATH_POINTS = 220;

export function simplifyPath(path: [number, number][], maxPoints = MAX_PATH_POINTS): [number, number][] {
  if (path.length <= maxPoints) return path;
  const step = (path.length - 1) / (maxPoints - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < maxPoints - 1; i++) out.push(path[Math.round(i * step)]);
  out.push(path[path.length - 1]);
  return out;
}

/** 응답에서 거리(m)를 km로 바꿔 소수 첫째 자리까지 돌려준다. 없으면 null */
export function pickDistanceKm(json: DirectionsResponse): number | null {
  if (json.code !== 0) return null;
  const meters = json.route?.traoptimal?.[0]?.summary?.distance;
  return typeof meters === "number" && meters >= 0 ? Math.round(meters / 100) / 10 : null;
}

/** 응답에서 경로(거리·시간·통행료·줄인 경로선)를 꺼낸다. 거리가 없으면 null */
export function pickRoute(json: DirectionsResponse, start: [number, number], goal: [number, number]): DrivingRoute | null {
  const distanceKm = pickDistanceKm(json);
  if (distanceKm === null) return null;
  const s = json.route?.traoptimal?.[0];
  const path = Array.isArray(s?.path) ? simplifyPath(s.path.filter((p) => Array.isArray(p) && p.length === 2)) : [];
  const dur = s?.summary?.duration;
  const toll = s?.summary?.tollFare;
  return {
    distanceKm,
    durationMin: typeof dur === "number" ? Math.round(dur / 60000) : null,
    tollFare: typeof toll === "number" ? toll : null,
    path,
    start,
    goal,
  };
}

export async function getDrivingDistanceKm(
  from: { sido: string; sigungu: string },
  to: { sido: string; sigungu: string },
): Promise<number | null> {
  return (await getDrivingRoute(from, to))?.distanceKm ?? null;
}

export async function getDrivingRoute(
  from: { sido: string; sigungu: string },
  to: { sido: string; sigungu: string },
): Promise<DrivingRoute | null> {
  const id = process.env.NAVER_MAPS_DIRECTIONS_ID;
  const secret = process.env.NAVER_MAPS_DIRECTIONS_SECRET;
  const a = getCoord(from.sido, from.sigungu);
  const b = getCoord(to.sido, to.sigungu);
  if (!id || !secret || !a || !b) return null;

  return memo(`naver:${a.join(",")}:${b.join(",")}`, DISTANCE_TTL_MS, async () => {
    const url = new URL(URL_DRIVING);
    url.searchParams.set("start", a.join(","));
    url.searchParams.set("goal", b.join(","));
    url.searchParams.set("option", "traoptimal");
    const r = await fetchJson<DirectionsResponse>("네이버 Directions", url, {
      headers: { "x-ncp-apigw-api-key-id": id, "x-ncp-apigw-api-key": secret },
    });
    return r.ok ? pickRoute(r.data, a, b) : null;
  });
}
