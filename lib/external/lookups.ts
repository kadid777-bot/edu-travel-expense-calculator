// Design Ref: §2.2 처리 4 — 외부 요금 조회 (네이버 지도 Directions · 오피넷 · TAGO 열차요금)
// 계산 엔진(lib/calc)은 이 결과(Lookups)를 받기만 한다. 조회가 실패하면 해당 값은 null이 된다.
import { getCourse } from "../../data/courses";
import { findStations } from "../../data/stations";
import type { CalculationInput, LegInput, LegLookup, Lookups } from "../calc/types";
import { isLocalLeg } from "../calc/zone";
import { runLimited } from "./http";
import { getDrivingDistanceKm } from "./naver-maps";
import { getGasolinePrice } from "./opinet";
import { getRailFareCap, railStationIssue } from "./tago";

export interface LookupResult {
  lookups: Lookups;
  /** true면 실제 요금이 아니라 화면 확인용 가상 값 */
  mock: boolean;
  /** 조회 시각 (ISO) */
  fetchedAt: string;
  /** 결과를 읽을 때 알아야 할 조회 조건 (예: 유가 기준일, 대체 조회일) */
  notes: string[];
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

  const course = getCourse(input.courseId);
  if (!course) throw new Error(`없는 교육 과정: ${input.courseId}`);
  const venue = { sido: course.venueSido, sigungu: course.venueSigungu };
  const notes: string[] = [];

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

  const gasolineTask = needsFuel ? getGasolinePrice() : Promise.resolve(null);
  const tasks = active.flatMap((l) => {
    const idx = l.leg === input.outbound ? 0 : 1;
    const list: (() => Promise<void>)[] = [
      async () => {
        const issue = railStationIssue(l.from, l.to);
        const rail = issue ? null : await getRailFareCap(l.from, l.to, l.date);
        out[idx].fare = rail ? rail.fare : null;
        out[idx].fareReason = rail ? null : (issue ?? "not-found");
        if (rail?.substituted) {
          notes.push(`열차요금은 교육일(${l.date})의 시간표가 아직 없어 ${rail.refDate} 기준으로 조회했습니다`);
        }
      },
    ];
    if (l.leg.transport === "car") {
      list.push(async () => {
        out[idx].distanceKm = await getDrivingDistanceKm(l.from, l.to);
      });
    }
    return list;
  });
  await runLimited(tasks, 8);

  const gas = await gasolineTask;
  if (gas) {
    for (const l of active) {
      if (l.leg.transport === "car") out[l === legs[0] ? 0 : 1].gasolinePrice = gas.price;
    }
    notes.push(
      `휘발유 평균가는 출장 당일이 아니라 오피넷 기준일(${gas.tradeDate}) 전국 평균가입니다 (오피넷 오픈 API는 날짜별 가격을 주지 않습니다)`,
    );
  }
  if (active.length > 0) {
    notes.push("열차요금 상한은 같은 구간에서 열차 종류별로 요금이 다를 때 가장 높은 일반실(성인) 요금입니다");
  }

  return { lookups: { outbound: out[0], inbound: out[1] }, mock: false, fetchedAt, notes: [...new Set(notes)] };
}
