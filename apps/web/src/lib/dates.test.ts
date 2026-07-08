import { describe, it, expect } from "vitest";
import {
  jstDateParts,
  jstDayOfMonth,
  jstDaysInMonth,
  jstMonthRange,
  jstEndOfDay,
  monthKey,
  jstMonthKey,
} from "./dates";

describe("jstDateParts", () => {
  it("UTC 15:30 は JST では翌日", () => {
    expect(jstDateParts(new Date("2026-07-08T15:30:00Z"))).toEqual({
      year: 2026,
      month: 7,
      day: 9,
    });
  });
  it("UTC 14:59 は JST では同日 23:59", () => {
    expect(jstDateParts(new Date("2026-07-08T14:59:00Z"))).toEqual({
      year: 2026,
      month: 7,
      day: 8,
    });
  });
});

describe("jstDayOfMonth", () => {
  it("JST の日番号を返す", () => {
    expect(jstDayOfMonth(new Date("2026-07-08T15:30:00Z"))).toBe(9);
  });
});

describe("jstDaysInMonth", () => {
  it("うるう年2月は29", () => {
    expect(jstDaysInMonth(2024, 2)).toBe(29);
  });
  it("平年2月は28", () => {
    expect(jstDaysInMonth(2026, 2)).toBe(28);
  });
  it("7月は31、4月は30", () => {
    expect(jstDaysInMonth(2026, 7)).toBe(31);
    expect(jstDaysInMonth(2026, 4)).toBe(30);
  });
});

describe("jstMonthRange", () => {
  it("JST 月初は前日 UTC15:00、月末は末日 UTC14:59:59.999", () => {
    const { start, end } = jstMonthRange(2026, 7);
    expect(start.toISOString()).toBe("2026-06-30T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T14:59:59.999Z");
  });
});

describe("jstEndOfDay", () => {
  it("JST の当日終端（UTC では翌日14:59:59.999）を返す", () => {
    expect(jstEndOfDay(new Date("2026-07-08T05:00:00Z")).toISOString()).toBe(
      "2026-07-08T14:59:59.999Z",
    );
  });
});

describe("monthKey / jstMonthKey", () => {
  it("monthKey はゼロ埋め YYYY-MM-01", () => {
    expect(monthKey(2026, 7)).toBe("2026-07-01");
    expect(monthKey(2026, 12)).toBe("2026-12-01");
  });
  it("jstMonthKey は date の JST 月初", () => {
    expect(jstMonthKey(new Date("2026-07-31T15:30:00Z"))).toBe("2026-08-01");
  });
});
