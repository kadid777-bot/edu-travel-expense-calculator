import type { Course, LegInput } from "./types";

/** 여비세칙 제12조의 '시내'는 시·군 단위다. 특별시·광역시·특별자치시는 구까지 하나의 시, 도는 '○○시'/'○○군' 단위로 본다. */
export function cityKey(sido: string, sigungu: string): string {
  // 광역시의 구는 같은 시이지만, 광역시 안의 군(기장군·달성군·강화군·옹진군·울주군)은 별도 시·군으로 본다
  if (/(특별시|광역시|특별자치시)$/.test(sido)) return /군$/.test(sigungu) ? `${sido} ${sigungu}` : sido;
  return `${sido} ${sigungu.split(" ")[0]}`;
}

export function isLocalLeg(leg: LegInput, course: Course): boolean {
  return cityKey(leg.sido, leg.sigungu) === cityKey(course.venueSido, course.venueSigungu);
}
