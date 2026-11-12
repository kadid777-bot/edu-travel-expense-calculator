// Design Ref: §2.2 처리 4 — 외부 요금 조회 (네이버 지도 Directions · 오피넷 · TAGO 열차요금)
// 계산 엔진(lib/calc)은 이 결과(Lookups)를 받기만 한다. 조회가 실패하면 해당 값은 null이 된다.
import { getCoord } from "../../data/coords";
import { findStations } from "../../data/stations";
import type { CalculationInput, LegInput, LegLookup, Lookups } from "../calc/types";
import { resolveCourse } from "../calc/course";
import { isLocalLeg } from "../calc/zone";
import { runLimited } from "./http";
import { getDrivingRoute } from "./naver-maps";
import { getGasolineForPeriod, getGasolinePrice, type DailyPrice } from "./opinet";
import { getRailFareCap, railStationIssue } from "./tago";

/** 교육생이 직접 확인할 수 있도록 남기는 조회 근거 (계산에는 쓰지 않는다) */
export interface LegEvidence {
  label: "가는 편" | "오는 편";
  from: string;
  to: string;
  rail?: {
    depStation: string;
    arrStation: string;
    refDate: string; // YYYYMMDD
    substituted: boolean;
    routes: { depStation: string; arrStation: string; fare: number }[];
    grades: { grade: string; fare: number }[];
    cap: number;
  };
  car?: {
    distanceKm: number;
    naverUrl: string;
    durationMin: number | null;
    tollFare: number | null;
    path: [number, number][];
    start: [number, number];
    goal: [number, number];
  };
}
export interface LookupEvidence {
  legs: LegEvidence[];
  gasoline?: {
    price: number;
    tradeDate: string;
    /** 기간을 골랐으면 평균에 쓴 날짜별 가격과 고른 기간 */
    period?: { startDate: string; endDate: string; days: DailyPrice[]; requestedDays: number; fellBack: boolean };
  };
  links: { korail: string; opinet: string };
}

export const LINKS = { korail: "https://www.korail.com", opinet: "https://www.opinet.co.kr" };

/** 네이버 지도 자동차 길찾기 링크 (출발·도착 대표 좌표) */
export function naverRouteUrl(from: { sido: string; sigungu: string }, to: { sido: string; sigungu: string }): string | null {
  const a = getCoord(from.sido, from.sigungu);
  const b = getCoord(to.sido, to.sigungu);
  if (!a || !b) return null;
  const q = new URLSearchParams({
    slng: String(a[0]), slat: String(a[1]), stext: `${from.sido} ${from.sigungu}`,
    elng: String(b[0]), elat: String(b[1]), etext: `${to.sido} ${to.sigungu}`,
    menu: "route", pathType: "0",
  });
  return `https://map.naver.com/index.nhn?${q.toString()}`;
}

export interface LookupResult {
  lookups: Lookups;
  /** true면 실제 요금이 아니라 화면 확인용 가상 값 */
  mock: boolean;
  /** 조회 시각 (ISO) */
  fetchedAt: string;
  /** 결과를 읽을 때 알아야 할 조회 조건 (예: 유가 기준일, 대체 조회일) */
  notes: string[];
  /** 조회 근거 (화면에서 직접 확인용). 가상 조회(mock)에서는 없다 */
  evidence?: LookupEvidence;
}

// ── 화면 확인용 가상 조회값 (MOCK_EXTERNAL=1 일 때만) ─────────────────────────────────
function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function mockLeg(leg: LegInput): LegLookup {
  const noStation = findStations(leg.sido, leg.sigungu).railId === null;
  const h = hash(`${leg.sido}${leg.sigungu}`);
  return {
    fare: noStation ? null : 15_000 + (h % 10) * 6_000,
    distanceKm: noStation ? null : 60 + (h % 40) * 8,
    gasolinePrice: 1_650 + (h % 5) * 10,
  };
}

function shouldMock(): boolean {
  return process.env.MOCK_EXTERNAL === "1";
}

// ── 실제 조회 ───────────────────────────────────────────────────────────────────────
export async function getLookups(input: CalculationInput): Promise<LookupResult> {
  const fetchedAt = new Date().toISOString();

  if (shouldMock()) {
    return {
      lookups: { outbound: mockLeg(input.outbound), inbound: mockLeg(input.inbound) },
      mock: true,
      fetchedAt,
      notes: [],
    };
  }

  const course = resolveCourse(input.courseId, input.customCourse);
  if (!course) throw new Error(`없는 교육 과정: ${input.courseId}`);
  const venue = { sido: course.venueSido, sigungu: course.venueSigungu };
  const notes: string[] = [];
  const legEvidence: (LegEvidence | undefined)[] = [undefined, undefined];

  const isLocal = (leg: LegInput) => isLocalLeg(leg, course);
  const legs = [
    { leg: input.outbound, from: input.outbound, to: venue, date: course.startDate }, // 가는 편: 교육 시작일 기준
    { leg: input.inbound, from: venue, to: input.inbound, date: course.endDate }, // 오는 편: 교육 종료일 기준
  ];
  const active = legs.filter((l) => !isLocal(l.leg)); // 시내 구간은 여비 대상이 아니라 조회하지 않는다
  const needsFuel = active.some((l) => l.leg.transport === "car");

  const out: [LegLookup, LegLookup] = [
    { fare: null, distanceKm: null, gasolinePrice: null },
    { fare: null, distanceKm: null, gasolinePrice: null },
  ];

  const fp = input.fuelPeriod;
  const wantsPeriod = needsFuel && !!fp && fp.startDate !== "" && fp.endDate !== "";
  const periodTask = wantsPeriod ? getGasolineForPeriod(fp!.startDate.replaceAll("-", ""), fp!.endDate.replaceAll("-", "")) : Promise.resolve(null);
  const gasolineTask = needsFuel ? getGasolinePrice() : Promise.resolve(null);
  const tasks = active.flatMap((l) => {
    const idx = l.leg === input.outbound ? 0 : 1;
    const list: (() => Promise<void>)[] = [
      async () => {
        const issue = railStationIssue(l.from, l.to);
        const rail = issue ? null : await getRailFareCap(l.from, l.to, l.date);
        out[idx].fare = rail ? rail.fare : null;
        out[idx].fareReason = rail ? null : (issue ?? "not-found");
        if (rail) {
          const ev = (legEvidence[idx] ??= { label: idx === 0 ? "가는 편" : "오는 편", from: `${l.from.sido} ${l.from.sigungu}`, to: `${l.to.sido} ${l.to.sigungu}` });
          ev.rail = { depStation: rail.depStation, arrStation: rail.arrStation, refDate: rail.refDate, substituted: rail.substituted, routes: rail.routes.map((r) => ({ depStation: r.depStation, arrStation: r.arrStation, fare: r.fare })), grades: rail.grades, cap: rail.fare };
        }
        if (rail?.substituted) {
          notes.push(`열차요금은 교육일(${l.date})의 시간표가 아직 없어 ${rail.refDate} 기준으로 조회했습니다`);
        }
      },
    ];
    if (l.leg.transport === "car") {
      list.push(async () => {
        const route = await getDrivingRoute(l.from, l.to);
        const km = route ? route.distanceKm : null;
        out[idx].distanceKm = km;
        const url = naverRouteUrl(l.from, l.to);
        if (km !== null && url) {
          const ev = (legEvidence[idx] ??= { label: idx === 0 ? "가는 편" : "오는 편", from: `${l.from.sido} ${l.from.sigungu}`, to: `${l.to.sido} ${l.to.sigungu}` });
          ev.car = { distanceKm: km, naverUrl: url, durationMin: route!.durationMin, tollFare: route!.tollFare, path: route!.path, start: route!.start, goal: route!.goal };
        }
      });
    }
    return list;
  });
  await runLimited(tasks, 8);

  const todayGas = await gasolineTask;
  const periodGas = await periodTask;
  // 고른 기간에 오피넷 제공 날짜가 있으면 그 평균, 없으면 조회일 평균으로 대신하고 알린다
  const gas = periodGas ? { price: periodGas.price, tradeDate: todayGas?.tradeDate ?? "" } : todayGas;
  if (gas) {
    for (const l of active) {
      if (l.leg.transport === "car") out[l === legs[0] ? 0 : 1].gasolinePrice = gas.price;
    }
    if (periodGas) {
      const list = periodGas.days.map((d) => `${d.date.slice(4, 6)}/${d.date.slice(6, 8)}`).join(", ");
      notes.push(
        `휘발유 가격은 선택한 기간(${fp!.startDate} ~ ${fp!.endDate}) 중 오피넷이 제공하는 ${periodGas.days.length}일(${list})의 전국 평균가를 평균한 값입니다${periodGas.days.length < periodGas.requestedDays ? " (오피넷 오픈 API는 최근 7일과 오늘 가격만 제공해서 나머지 날짜는 쓰지 않았습니다)" : ""}`,
      );
    } else {
      if (wantsPeriod) {
        notes.push("선택한 기간의 가격은 오피넷이 제공하지 않아(최근 7일과 오늘만 제공) 조회일 전국 평균가로 계산했습니다");
      }
      notes.push(
        `휘발유 평균가는 출장 당일이 아니라 오피넷 기준일(${gas.tradeDate}) 전국 평균가입니다 (오피넷 오픈 API는 날짜별 가격을 주지 않습니다)`,
      );
    }
  }
  if (active.length > 0) {
    notes.push("열차요금 상한은 같은 구간에서 열차 종류별로 요금이 다를 때 가장 높은 일반실(성인) 요금입니다");
  }

  const evidence: LookupEvidence = {
    legs: legEvidence.filter((e): e is LegEvidence => e !== undefined),
    gasoline: gas
      ? {
          price: gas.price,
          tradeDate: gas.tradeDate,
          period: wantsPeriod
            ? { startDate: fp!.startDate, endDate: fp!.endDate, days: periodGas?.days ?? [], requestedDays: periodGas?.requestedDays ?? 0, fellBack: !periodGas }
            : undefined,
        }
      : undefined,
    links: LINKS,
  };
  return { lookups: { outbound: out[0], inbound: out[1] }, mock: false, fetchedAt, notes: [...new Set(notes)], evidence };
}
