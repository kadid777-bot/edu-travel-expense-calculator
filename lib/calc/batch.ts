// Design Ref: §4.2 POST /api/calculate-batch, §5.3 운영자 화면 — 명단(CSV/탭 구분 표) ↔ 계산 입력 변환 (브라우저·서버 공용, 네트워크 없음)
import type { CalculationInput, LegInput, TransportMode } from "./types";

export const MAX_PEOPLE = 110; // 한 번에 처리하는 전체 인원
export const CHUNK_SIZE = 25; // 서버 한 번 호출당 인원

const TRANSPORT_BY_LABEL: Record<string, TransportMode> = {
  기차: "train", 열차: "train", train: "train",
  버스: "bus", 고속버스: "bus", bus: "bus",
  항공: "air", 비행기: "air", air: "air",
  자차: "car", 자가용: "car", car: "car",
};
export const TRANSPORT_LABEL: Record<TransportMode, string> = { train: "기차", bus: "버스", air: "항공", car: "자차" };

export const CSV_HEADER = [
  "이름", "가는편 시·도", "가는편 시·군·구", "가는편 교통수단", "가는편 교통비실비(자차는 하이패스)",
  "오는편 시·도", "오는편 시·군·구", "오는편 교통수단", "오는편 교통비실비(자차는 하이패스)",
  "숙박 박수", "박별 숙박비(/로 구분)", "식비 청구 일수(선택, 기본 0)",
];

export interface BatchRow {
  rowNo: number;
  name: string; // 브라우저에서만 쓴다. 서버로 보내지 않는다
  input: Omit<CalculationInput, "courseId">;
}
export interface ParsedRows {
  rows: BatchRow[];
  errors: { line: number; message: string }[];
}

/** 쉼표 또는 탭으로 구분된 줄을 칸으로 나눈다 (큰따옴표 지원) */
export function splitLine(line: string): string[] {
  const delim = line.includes("\t") ? "\t" : ",";
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s.trim() === "") return undefined;
  const n = Number(s.replace(/[,원\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

function leg(cells: string[], label: string, errs: string[]): LegInput {
  const [sido = "", sigungu = "", mode = "", money = ""] = cells;
  const transport = TRANSPORT_BY_LABEL[mode.replace(/\s/g, "").toLowerCase()];
  if (!transport) errs.push(`${label} 교통수단은 기차·버스·항공·자차 중 하나여야 합니다`);
  const amount = num(money);
  if (amount !== undefined && Number.isNaN(amount)) errs.push(`${label} 금액이 숫자가 아닙니다`);
  const base: LegInput = { sido, sigungu, transport: transport ?? "train" };
  if (transport === "car") base.tollActual = amount && !Number.isNaN(amount) ? amount : 0;
  else if (amount !== undefined && !Number.isNaN(amount)) base.transportActual = amount;
  return base;
}

/** 붙여넣은 표/CSV 텍스트를 계산 입력으로 바꾼다. 첫 줄이 제목줄이면 건너뛴다 */
export function parseRows(text: string): ParsedRows {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows: BatchRow[] = [];
  const errors: ParsedRows["errors"] = [];
  lines.forEach((raw, idx) => {
    if (raw.trim() === "") return;
    const cells = splitLine(raw);
    if (idx === 0 && (cells[0] === "이름" || cells[1]?.includes("시·도"))) return;
    const errs: string[] = [];
    if (cells.length < 10) errs.push("칸이 부족합니다 (이름부터 숙박 박수까지 10칸 이상 필요)");
    const nights = num(cells[9]);
    if (nights === undefined || Number.isNaN(nights) || !Number.isInteger(nights) || nights < 0) {
      errs.push("숙박 박수는 0 이상의 정수여야 합니다");
    }
    const lodging = (cells[10] ?? "").split("/").map((x) => x.trim()).filter((x) => x !== "").map((x) => num(x));
    if (lodging.some((x) => x === undefined || Number.isNaN(x))) errs.push("박별 숙박비가 숫자가 아닙니다");
    const mealDays = num(cells[11]);
    if (mealDays !== undefined && (Number.isNaN(mealDays) || !Number.isInteger(mealDays) || mealDays < 0)) {
      errs.push("식비 청구 일수는 0 이상의 정수여야 합니다");
    }
    const outbound = leg(cells.slice(1, 5), "가는 편", errs);
    const inbound = leg(cells.slice(5, 9), "오는 편", errs);
    if (errs.length > 0) {
      errors.push({ line: idx + 1, message: errs.join(" / ") });
      return;
    }
    rows.push({
      rowNo: rows.length + 1,
      name: cells[0],
      input: { outbound, inbound, nights: nights!, lodgingActuals: lodging as number[], ...(mealDays ? { mealDays } : {}) },
    });
  });
  return { rows, errors };
}

/** 25명씩 나눈다 */
export function chunk<T>(list: T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** 엑셀에서 바로 열리는 CSV (한글이 깨지지 않도록 BOM 포함). 수식으로 읽히지 않게 = + - @ 로 시작하는 글자는 앞에 ' 를 붙인다 */
export function toCsv(table: (string | number)[][]): string {
  const esc = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + table.map((r) => r.map(esc).join(",")).join("\r\n");
}
