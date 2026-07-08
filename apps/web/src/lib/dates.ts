const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 絶対時刻を JST カレンダーの年・月(1-12)・日に分解する。 */
export function jstDateParts(date: Date): { year: number; month: number; day: number } {
  const t = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
  };
}

/** JST における「今日」を表す現在時刻。日付演算は jstDateParts 等を通す。 */
export function jstToday(): Date {
  return new Date();
}

/** JST での日番号（Ruby の Date#day 相当）。 */
export function jstDayOfMonth(date: Date): number {
  return jstDateParts(date).day;
}

/** JST 指定月の末日の日番号（Ruby の end_of_month.day 相当）。 */
export function jstDaysInMonth(year: number, month: number): number {
  // Date.UTC の day=0 は前月末日 → month をそのまま渡すと当月末日になる
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** JST 指定月の月初〜月末（Ruby の all_month 相当）の絶対時刻範囲。 */
export function jstMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - JST_OFFSET_MS);
  const last = jstDaysInMonth(year, month);
  const end = new Date(Date.UTC(year, month - 1, last, 23, 59, 59, 999) - JST_OFFSET_MS);
  return { start, end };
}

/** date が属する JST 日の終端（23:59:59.999）の絶対時刻（Ruby の end_of_day 相当）。 */
export function jstEndOfDay(date: Date): Date {
  const { year, month, day } = jstDateParts(date);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - JST_OFFSET_MS);
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** 'YYYY-MM-01'（budgets.month 等の date カラム比較キー）。 */
export function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

/** date が属する JST 月の月初キー 'YYYY-MM-01'（Ruby の beginning_of_month 相当）。 */
export function jstMonthKey(date: Date): string {
  const { year, month } = jstDateParts(date);
  return monthKey(year, month);
}
