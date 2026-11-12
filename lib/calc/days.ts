// Design Ref: §2.2 처리 1 — 교육 일수 = 종료일 − 시작일 + 1 (양 끝 날짜 포함)

export function countDays(startDate: string, endDate: string): number {
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** 원 단위 표시 (예: 59,800원) */
export function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}
