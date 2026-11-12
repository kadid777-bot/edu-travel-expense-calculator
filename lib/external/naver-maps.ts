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
  route?: { traoptimal?: { summary?: { distance?: number } }[] };
}

/** 응답에서 거리(m)를 km로 바꿔 소수 첫째 자리까지 돌려준다. 없으면 null */
export function pickDistanceKm(json: DirectionsResponse): number | null {
  if (json.code !== 0) return null;
  const meters = json.route?.traoptimal?.[0]?.summary?.distance;
  return typeof meters === "number" && meters >= 0 ? Math.round(meters / 100) / 10 : null;
}

export async function getDrivingDistanceKm(
  from: { sido: string; sigungu: string },
  to: { sido: string; sigungu: string },
): Promise<number | null> {
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
    return r.ok ? pickDistanceKm(r.data) : null;
  });
}
