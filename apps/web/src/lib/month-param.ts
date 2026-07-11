import { jstDateParts, jstToday } from "./dates";

/** `?month=YYYY-MM` を解決する。不正・未指定は当月（JST）へフォールバック */
export function resolveMonthParam(param: string | undefined): { year: number; month: number } {
  if (param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param)) {
    const [year, month] = param.split("-").map(Number);
    return { year, month };
  }
  const today = jstDateParts(jstToday());
  return { year: today.year, month: today.month };
}

/** {year, month} → 'YYYY-MM'（month クエリ値） */
export function monthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
