import { describe, it, expect } from "vitest";
import { calcBudgetPace } from "./budget-pace";

// JST 2025-01-10 固定
const d = (iso: string) => new Date(iso);
const JAN10 = d("2025-01-10T00:00:00+09:00");
const JAN31 = d("2025-01-31T00:00:00+09:00");

describe("calcBudgetPace", () => {
  it("GREEN: ペース以内", () => {
    const r = calcBudgetPace({ budgetAmount: 30_000, spentAmount: 8_000, date: JAN10 });
    expect(r.paceStatus).toBe("GREEN"); // pace_rate ≈ 0.83
    expect(r.remainingAmount).toBe(22_000);
    expect(r.dailyAmount).toBe(1_000); // floor(22000 / 22)
  });

  it("YELLOW: ややペース超過", () => {
    const r = calcBudgetPace({ budgetAmount: 30_000, spentAmount: 10_000, date: JAN10 });
    expect(r.paceStatus).toBe("YELLOW"); // pace_rate ≈ 1.03
  });

  it("RED: 大幅ペース超過", () => {
    const r = calcBudgetPace({ budgetAmount: 30_000, spentAmount: 15_000, date: JAN10 });
    expect(r.paceStatus).toBe("RED"); // pace_rate ≈ 1.55
  });

  it("YELLOW 境界: pace_rate = 1.0 ちょうど", () => {
    // budget 31000, spent 10000, ideal=10/31 → actual=10000/31000=ideal → pace_rate=1.0
    const r = calcBudgetPace({ budgetAmount: 31_000, spentAmount: 10_000, date: JAN10 });
    expect(r.paceRate).toBeCloseTo(1.0, 10);
    expect(r.paceStatus).toBe("YELLOW");
  });

  it("RED 境界: pace_rate = 1.2 ちょうど", () => {
    // budget 31000, spent 12000 → actual=12000/31000, pace_rate = actual/(10/31) = 1.2
    const r = calcBudgetPace({ budgetAmount: 31_000, spentAmount: 12_000, date: JAN10 });
    expect(r.paceRate).toBeCloseTo(1.2, 10);
    expect(r.paceStatus).toBe("RED");
  });

  it("actual_rate >= 1.0 は pace_rate に関わらず強制 RED", () => {
    // 1/31 に予算使い切り: ideal=1.0, pace_rate=1.0（本来 YELLOW）だが actual>=1 で RED
    const r = calcBudgetPace({ budgetAmount: 30_000, spentAmount: 30_000, date: JAN31 });
    expect(r.paceStatus).toBe("RED");
    expect(r.dailyAmount).toBe(0); // remaining_days=1, remaining=0
  });

  it("daily_amount は負値でも floor（trunc ではない）", () => {
    // remaining=-10000, remaining_days=22 → floor(-454.5)=-455
    const r = calcBudgetPace({ budgetAmount: 30_000, spentAmount: 40_000, date: JAN10 });
    expect(r.dailyAmount).toBe(-455);
  });
});
