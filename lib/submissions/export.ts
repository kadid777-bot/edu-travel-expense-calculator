// Design Ref: docs/SUBMISSION-DESIGN.md §8 — 운영자 취합용 CSV (엑셀에서 열림)
import { TRANSPORT_LABEL, toCsv } from "../calc/batch";
import type { ExpenseItem } from "../calc/types";
import { FILE_KIND_LABEL, type Submission } from "./types";

const ITEM_ORDER = ["교통비(가는 편)", "교통비(오는 편)", "숙박비", "일비", "식비"] as const;

export const EXPORT_HEADER = [
  "접수 번호", "제출 시각", "이름", "사번",
  "교육 장소", "교육 시작일", "교육 종료일", "숙소 제공", "식사 제공",
  "가는 편 출발지", "가는 편 교통수단", "가는 편 실비/하이패스",
  "오는 편 귀가지", "오는 편 교통수단", "오는 편 실비/하이패스",
  "숙박 박수", "박별 숙박비 실비", "식비 청구 일수", "휘발유 가격 기준 기간",
  ...ITEM_ORDER.map((c) => `${c} 인정액`),
  "합계", "경고", "증빙 수", "증빙 종류",
];

const money = (leg: Submission["input"]["outbound"]) =>
  leg.transport === "car" ? (leg.tollActual ?? 0) : (leg.transportActual ?? 0);

export function exportRow(s: Submission): (string | number)[] {
  const c = s.input.customCourse;
  const item = (cat: string): ExpenseItem | undefined => s.result.items.find((i) => i.category === cat);
  const kinds = [...new Set(s.files.map((f) => FILE_KIND_LABEL[f.kind]))].join(" / ");
  const fp = s.input.fuelPeriod;
  return [
    s.id, s.createdAt, s.submitter.name, s.submitter.employeeNo,
    c ? `${c.venueSido} ${c.venueSigungu}` : "", c?.startDate ?? "", c?.endDate ?? "",
    c?.lodgingProvided ? "예" : "아니오", c?.mealsProvided ? "예" : "아니오",
    `${s.input.outbound.sido} ${s.input.outbound.sigungu}`, TRANSPORT_LABEL[s.input.outbound.transport], money(s.input.outbound),
    `${s.input.inbound.sido} ${s.input.inbound.sigungu}`, TRANSPORT_LABEL[s.input.inbound.transport], money(s.input.inbound),
    s.input.nights, (s.input.lodgingActuals ?? []).join("/"), s.input.mealDays ?? 0,
    fp && fp.startDate ? `${fp.startDate} ~ ${fp.endDate}` : "",
    ...ITEM_ORDER.map((cat) => item(cat)?.approved ?? ""),
    s.result.total, s.result.warnings.join(" | "), s.files.length, kinds,
  ];
}

export function submissionsToCsv(list: Submission[]): string {
  return toCsv([EXPORT_HEADER, ...list.map(exportRow)]);
}
