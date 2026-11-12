// Design Ref: §8 — 외부 연동(모듈 3): 응답 해석·실패 처리·상한 규칙을 가짜 응답으로 확인한다 (실제 서비스는 부르지 않는다)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCoord, missingCoords } from "../data/coords";
import { STATIONS_BY_SIDO, findStations } from "../data/stations";
import { SIGUNGU } from "../data/sigungu";
import { clearMemo, memo, runLimited } from "../lib/external/http";
import { pickDistanceKm, getDrivingDistanceKm } from "../lib/external/naver-maps";
import { pickGasoline, getGasolinePrice } from "../lib/external/opinet";
import { getRailFareCap, pickFaresByGrade, pickMaxFare } from "../lib/external/tago";
import { naverRouteUrl } from "../lib/external/lookups";

const tago = (items: unknown) =>
  ({ response: { header: { resultCode: "00" }, body: { items } } }) as Parameters<typeof pickMaxFare>[0];

function stubFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => ({
      ok: true,
      status: 200,
      json: async () => handler(String(input)),
    })),
  );
}

beforeEach(() => clearMemo());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("TAGO 열차요금: 같은 구간에서 요금이 다르면 가장 높은 일반실 요금이 상한", () => {
  it("여러 열차 중 최댓값을 고른다", () => {
    const json = tago({
      item: [
        { traingradename: "ITX-새마을", adultcharge: "42600" },
        { traingradename: "KTX", adultcharge: "54400" },
        { traingradename: "무궁화호", adultcharge: "42600" },
      ],
    });
    expect(pickMaxFare(json)).toBe(54_400);
  });

  it("열차 종류별 요금표는 종류마다 가장 높은 요금을 요금 순으로 보여준다", () => {
    const json = tago({
      item: [
        { traingradename: "KTX", adultcharge: "54400" },
        { traingradename: "KTX", adultcharge: "59800" },
        { traingradename: "무궁화호", adultcharge: "42600" },
      ],
    });
    expect(pickFaresByGrade(json)).toEqual([
      { grade: "KTX", fare: 59_800 },
      { grade: "무궁화호", fare: 42_600 },
    ]);
  });

  it("네이버 지도 링크는 출발·도착 좌표와 이름을 담는다", () => {
    const url = naverRouteUrl({ sido: "서울특별시", sigungu: "강남구" }, { sido: "부산광역시", sigungu: "해운대구" });
    expect(url).toContain("map.naver.com");
    expect(url).toContain("slng=");
    expect(url).toContain("menu=route");
    expect(naverRouteUrl({ sido: "없는도", sigungu: "x" }, { sido: "서울특별시", sigungu: "강남구" })).toBeNull();
  });

  it("열차가 1대뿐이면 객체 하나로 와도 읽는다", () => {
    expect(pickMaxFare(tago({ item: { adultcharge: 8400 } }))).toBe(8_400);
  });

  it("결과가 비어 있으면(빈 문자열 items) null", () => {
    expect(pickMaxFare(tago(""))).toBeNull();
    expect(pickMaxFare(tago({ item: [] }))).toBeNull();
  });

  it("교육일 시간표가 없으면 내일 날짜로 한 번 더 조회하고 그 사실을 알린다", async () => {
    vi.stubEnv("DATA_GO_KR_TRAIN_KEY", "test-key");
    stubFetch((url) => {
      const day = new URL(url).searchParams.get("depPlandTime");
      return day === "20270301" ? tago("") : tago({ item: [{ adultcharge: "54400" }, { adultcharge: "59800" }] });
    });
    const r = await getRailFareCap(
      { sido: "부산광역시", sigungu: "해운대구" },
      { sido: "서울특별시", sigungu: "강남구" },
      "2027-03-01",
    );
    expect(r).not.toBeNull();
    expect(r?.fare).toBe(59_800); // 가장 높은 요금
    expect(r?.substituted).toBe(true);
    expect(r?.refDate).not.toBe("20270301");
    expect(r?.depStation).toBeTruthy(); // 직접 확인용 대표역 이름
    expect(r?.grades.length).toBeGreaterThan(0);
  });

  it("역이 없거나(울릉군·제주) 같은 역이면 null — 호출도 하지 않는다", async () => {
    vi.stubEnv("DATA_GO_KR_TRAIN_KEY", "test-key");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const seoul = { sido: "서울특별시", sigungu: "강남구" };
    expect(await getRailFareCap({ sido: "경상북도", sigungu: "울릉군" }, seoul, "2026-12-01")).toBeNull();
    expect(await getRailFareCap({ sido: "제주특별자치도", sigungu: "제주시" }, seoul, "2026-12-01")).toBeNull();
    expect(await getRailFareCap({ sido: "경기도", sigungu: "수원시 팔달구" }, { sido: "경기도", sigungu: "성남시 분당구" }, "2026-12-01")).toBeNull(); // 둘 다 수원역
    expect(spy).not.toHaveBeenCalled();
  });

  it("인증키가 없으면 null (오류를 던지지 않는다)", async () => {
    vi.stubEnv("DATA_GO_KR_TRAIN_KEY", "");
    const r = await getRailFareCap(
      { sido: "부산광역시", sigungu: "해운대구" },
      { sido: "서울특별시", sigungu: "강남구" },
      "2026-12-01",
    );
    expect(r).toBeNull();
  });

  it("호출이 실패해도 null (예외 없음)", async () => {
    vi.stubEnv("DATA_GO_KR_TRAIN_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    const r = await getRailFareCap(
      { sido: "부산광역시", sigungu: "해운대구" },
      { sido: "서울특별시", sigungu: "강남구" },
      "2026-12-01",
    );
    expect(r).toBeNull();
  });
});

describe("네이버 Directions 거리", () => {
  it("거리(m)를 km(소수 1자리)로 바꾼다", () => {
    expect(pickDistanceKm({ code: 0, route: { traoptimal: [{ summary: { distance: 402106 } }] } })).toBe(402.1);
  });
  it("실패 코드이거나 값이 없으면 null", () => {
    expect(pickDistanceKm({ code: 1 })).toBeNull();
    expect(pickDistanceKm({ code: 0, route: {} })).toBeNull();
  });
  it("키가 없거나 좌표를 모르면 null, 있으면 호출한다", async () => {
    vi.stubEnv("NAVER_MAPS_DIRECTIONS_ID", "id");
    vi.stubEnv("NAVER_MAPS_DIRECTIONS_SECRET", "secret");
    stubFetch(() => ({ code: 0, route: { traoptimal: [{ summary: { distance: 150000 } }] } }));
    const a = { sido: "서울특별시", sigungu: "강남구" };
    expect(await getDrivingDistanceKm(a, { sido: "대전광역시", sigungu: "유성구" })).toBe(150);
    expect(await getDrivingDistanceKm(a, { sido: "없는도", sigungu: "없는구" })).toBeNull();
    vi.stubEnv("NAVER_MAPS_DIRECTIONS_ID", "");
    expect(await getDrivingDistanceKm(a, { sido: "부산광역시", sigungu: "남구" })).toBeNull();
  });
});

describe("오피넷 보통휘발유 평균가", () => {
  const json = {
    RESULT: {
      OIL: [
        { TRADE_DT: "20261112", PRODCD: "B034", PRICE: "2382.59" },
        { TRADE_DT: "20261112", PRODCD: "B027", PRICE: "1854.94" },
        { TRADE_DT: "20261112", PRODCD: "D047", PRICE: "1841.36" },
      ],
    },
  };
  it("보통휘발유(B027)만 고른다", () => {
    expect(pickGasoline(json)).toEqual({ price: 1854.94, tradeDate: "20261112" });
  });
  it("빈 결과·이상한 값이면 null", () => {
    expect(pickGasoline({ RESULT: { OIL: [] } })).toBeNull();
    expect(pickGasoline({ RESULT: { OIL: [{ PRODCD: "B027", PRICE: "abc" }] } })).toBeNull();
  });
  it("키가 있으면 호출하고 결과를 캐시한다", async () => {
    vi.stubEnv("OPINET_API_KEY", "key");
    stubFetch(() => json);
    expect((await getGasolinePrice())?.price).toBe(1854.94);
    expect((await getGasolinePrice())?.price).toBe(1854.94);
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

describe("공통 틀", () => {
  it("memo: 성공 값만 캐시하고 null은 다시 시도한다", async () => {
    let n = 0;
    expect(await memo("k", 1000, async () => (++n < 2 ? null : 7))).toBeNull();
    expect(await memo("k", 1000, async () => (++n < 2 ? null : 7))).toBe(7);
    expect(await memo("k", 1000, async () => 99)).toBe(7); // 캐시됨
  });

  it("runLimited: 동시에 limit개까지만 실행하고 결과 순서를 지킨다", async () => {
    let running = 0;
    let peak = 0;
    const tasks = Array.from({ length: 20 }, (_, i) => async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return i;
    });
    const out = await runLimited(tasks, 8);
    expect(peak).toBeLessThanOrEqual(8);
    expect(out).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});

describe("데이터 완성도", () => {
  it("모든 시·군·구에 대표 좌표가 있고 우리나라 범위 안이다", () => {
    expect(missingCoords()).toEqual([]);
    for (const [sido, list] of Object.entries(SIGUNGU)) {
      for (const g of list) {
        const [lng, lat] = getCoord(sido, g)!;
        expect(lng).toBeGreaterThan(124);
        expect(lng).toBeLessThan(132);
        expect(lat).toBeGreaterThan(33);
        expect(lat).toBeLessThan(39);
      }
    }
  });

  it("철도역이 있는 시·도의 역은 TAGO 역 ID를 가진다", () => {
    for (const [sido, s] of Object.entries(STATIONS_BY_SIDO)) {
      if (s.rail) expect(s.railId, sido).toMatch(/^NAT[0-9A-Z]{6}$/);
    }
    expect(findStations("서울특별시", "강남구").railId).toBe("NAT010000");
    expect(findStations("서울특별시", "강남구").group?.map((s) => s.rail)).toEqual(["서울", "용산", "수서"]);
    expect(findStations("경상북도", "울릉군").railId).toBeNull();
    expect(findStations("제주특별자치도", "제주시").railId).toBeNull();
  });
});

describe("서울은 서울역·용산역·수서역 중 가장 높은 요금이 상한", () => {
  const daejeon = { sido: "대전광역시", sigungu: "유성구" };
  const fares: Record<string, number | undefined> = {
    "NATH30000:NAT011668": 20_100, // 수서→대전
    "NAT010000:NAT011668": 21_600, // 서울→대전
    // 용산→대전은 직통 열차가 없다
  };

  function stubByStation() {
    vi.stubEnv("DATA_GO_KR_TRAIN_KEY", "test-key");
    stubFetch((url) => {
      const p = new URL(url).searchParams;
      const fare = fares[`${p.get("depPlaceId")}:${p.get("arrPlaceId")}`];
      return tago(fare ? { item: [{ traingradename: "KTX", adultcharge: String(fare) }] } : "");
    });
  }

  it("서울의 어느 구에서든 역별 요금 중 가장 높은 금액(서울역 21,600원)을 상한으로 한다", async () => {
    stubByStation();
    for (const gu of ["강남구", "용산구", "중구"]) {
      const r = await getRailFareCap({ sido: "서울특별시", sigungu: gu }, daejeon, "2026-12-01");
      expect(r?.fare, gu).toBe(21_600);
      expect(r?.depStation, gu).toBe("서울");
      // 직통이 있는 역(서울·수서)만 표에 나오고, 요금 높은 순
      expect(r?.routes.map((x) => `${x.depStation}:${x.fare}`)).toEqual(["서울:21600", "수서:20100"]);
    }
  });

  it("도착지가 서울이어도(오는 편) 같은 규칙이다", async () => {
    vi.stubEnv("DATA_GO_KR_TRAIN_KEY", "test-key");
    stubFetch((url) => {
      const p = new URL(url).searchParams;
      const fare = p.get("depPlaceId") === "NAT014445" ? ({ NAT010000: 54_400, NAT010032: 0, NATH30000: 52_900 } as Record<string, number>)[p.get("arrPlaceId") ?? ""] : undefined;
      return tago(fare ? { item: [{ traingradename: "KTX", adultcharge: String(fare) }] } : "");
    });
    const r = await getRailFareCap({ sido: "부산광역시", sigungu: "해운대구" }, { sido: "서울특별시", sigungu: "강남구" }, "2026-12-01");
    expect(r?.fare).toBe(54_400);
    expect(r?.arrStation).toBe("서울");
  });
});
