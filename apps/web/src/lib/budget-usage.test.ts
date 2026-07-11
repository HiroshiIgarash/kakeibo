import { describe, expect, it } from "vitest";
import { budgetUsage } from "./budget-usage";

describe("budgetUsage", () => {
  it("予算内: 実パーセントとバー値が一致し isOver=false", () => {
    const u = budgetUsage(30_000, 60_000);
    expect(u).toEqual({
      hasBudget: true,
      percent: 50,
      barPercent: 50,
      isOver: false,
    });
  });

  it("予算超過: percent は 100 を超えた実値、barPercent は 100 で頭打ち", () => {
    const u = budgetUsage(90_000, 60_000);
    expect(u).toEqual({
      hasBudget: true,
      percent: 150,
      barPercent: 100,
      isOver: true,
    });
  });

  it("ちょうど100%: isOver=false（超過は「予算より多い」場合のみ）", () => {
    const u = budgetUsage(60_000, 60_000);
    expect(u).toEqual({
      hasBudget: true,
      percent: 100,
      barPercent: 100,
      isOver: false,
    });
  });

  it("端数は四捨五入する", () => {
    const u = budgetUsage(1, 3);
    expect(u).toMatchObject({ percent: 33 });
  });

  it("予算0円は未設定扱い（0%・赤残額のような矛盾表示を防ぐ）", () => {
    expect(budgetUsage(5_000, 0)).toEqual({ hasBudget: false });
  });

  it("予算が負でも未設定扱い", () => {
    expect(budgetUsage(5_000, -1)).toEqual({ hasBudget: false });
  });

  it("支出0円・予算あり: 0% で isOver=false", () => {
    const u = budgetUsage(0, 60_000);
    expect(u).toEqual({
      hasBudget: true,
      percent: 0,
      barPercent: 0,
      isOver: false,
    });
  });
});
