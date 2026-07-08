const JST_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** JS Date を JST の "YYYY-MM-DD" に変換する（DBは常にUTC、解釈はアプリ層で行う方針: spec §3.2） */
export function toJstDateString(date: Date): string {
  // en-CA ロケールは YYYY-MM-DD 形式を返す
  return JST_DATE_FMT.format(date);
}

/** "YYYY-MM-DD"（フォーム入力）を JST 0時ちょうどの絶対時刻(Date)へ変換する */
export function jstDateInputToDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+09:00`);
}
