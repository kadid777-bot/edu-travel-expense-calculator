// Design Ref: §2.2 처리 4 — 시·군·구 → 대표 철도역 대응표 (열차요금이 모든 교통수단의 상한이라 철도역만 쓴다)
// 역 ID는 TAGO 열차정보 API(GetCtyAcctoTrainSttnList)로 확인한 값이다 (2026-11-12 조회).
// 주의: "대표역"은 실습용으로 정한 것이다. 시·도 단위 기본값을 두고, 예외는 시·군·구 단위로 덮어쓴다.
//       null = 대응하는 철도역 없음 → 열차요금 "조회 실패" 처리

export interface StationPair {
  rail: string | null; // 대표 철도역 이름 (TAGO 표기)
  railId: string | null; // TAGO 역 ID (nodeid)
  bus: string | null; // 현재 미사용 (고속버스 상한도 열차요금)
}

const st = (rail: string, railId: string): StationPair => ({ rail, railId, bus: null });
const NONE: StationPair = { rail: null, railId: null, bus: null };

export const STATIONS_BY_SIDO: Record<string, StationPair> = {
  서울특별시: st("서울", "NAT010000"),
  부산광역시: st("부산", "NAT014445"),
  대구광역시: st("동대구", "NAT013271"),
  인천광역시: st("광명", "NATH10219"), // 인천은 고속철도 직결역이 없어 가까운 광명역으로 둠
  광주광역시: st("광주송정", "NAT031857"),
  대전광역시: st("대전", "NAT011668"),
  울산광역시: st("울산", "NATH13717"),
  세종특별자치시: st("오송", "NAT050044"),
  경기도: st("수원", "NAT010415"),
  강원특별자치도: st("강릉", "NAT601936"),
  충청북도: st("오송", "NAT050044"),
  충청남도: st("천안아산", "NATH10960"),
  전북특별자치도: st("전주", "NAT040257"),
  전라남도: st("목포", "NAT032563"),
  경상북도: st("포항", "NAT8B0351"),
  경상남도: st("창원중앙", "NAT880281"),
  제주특별자치도: NONE, // 철도 없음 (항공만)
};

/** 시·군·구 단위 예외 */
export const STATION_OVERRIDES: Record<string, StationPair> = {
  "경기도 고양시 일산동구": st("행신", "NAT110147"),
  "강원특별자치도 춘천시": st("춘천", "NAT140873"),
  "강원특별자치도 원주시": st("원주", "NAT020947"),
  "충청북도 충주시": st("충주", "NAT050827"),
  "전북특별자치도 익산시": st("익산", "NAT030879"),
  "전라남도 여수시": st("여수EXPO", "NAT041993"),
  "전라남도 순천시": st("순천", "NAT041595"),
  "경상북도 경주시": st("경주", "NATH13421"),
  "경상북도 안동시": st("안동", "NAT022558"),
  "경상남도 진주시": st("진주", "NAT881014"),
  "경상북도 울릉군": NONE, // 섬 지역 — 철도 없음
};

export function findStations(sido: string, sigungu: string): StationPair {
  return STATION_OVERRIDES[`${sido} ${sigungu}`] ?? STATIONS_BY_SIDO[sido] ?? NONE;
}
