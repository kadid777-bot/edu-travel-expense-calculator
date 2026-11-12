import type { CalculationResult } from "../../lib/calc/types";

export const CATEGORIES_ORDER = ["교통비(가는 편)", "교통비(오는 편)", "숙박비", "일비", "식비"] as const;

export interface BatchOutcome {
  rowNo: number;
  result?: CalculationResult;
  error?: { message: string; fieldErrors?: Record<string, string> };
}
