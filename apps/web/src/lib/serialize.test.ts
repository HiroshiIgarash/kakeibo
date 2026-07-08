import { describe, it, expect } from "vitest";
import { toJstDateString, jstDateInputToDate } from "./serialize";

describe("toJstDateString", () => {
  it("UTC の Date を JST 日付文字列に変換する", () => {
    // 2026-07-08 16:00 UTC = 2026-07-09 01:00 JST
    expect(toJstDateString(new Date("2026-07-08T16:00:00Z"))).toBe("2026-07-09");
  });
  it("JST 0時ちょうどの瞬間はその日", () => {
    // 2026-07-08 15:00 UTC = 2026-07-09 00:00 JST
    expect(toJstDateString(new Date("2026-07-08T15:00:00Z"))).toBe("2026-07-09");
  });
  it("JST 前日23:59はその前日", () => {
    // 2026-07-08 14:59 UTC = 2026-07-08 23:59 JST
    expect(toJstDateString(new Date("2026-07-08T14:59:00Z"))).toBe("2026-07-08");
  });
});

describe("jstDateInputToDate", () => {
  it("YYYY-MM-DD を JST 0時の絶対時刻に変換する", () => {
    // 2026-07-09 00:00 JST = 2026-07-08 15:00 UTC
    expect(jstDateInputToDate("2026-07-09").toISOString()).toBe("2026-07-08T15:00:00.000Z");
  });
  it("往復で同じ日付になる", () => {
    expect(toJstDateString(jstDateInputToDate("2026-01-31"))).toBe("2026-01-31");
  });
});
