import { describe, it, expect, afterEach } from "vitest";
import { createTestDb, type TestDatabase } from "../test/db";
import { categories, budgets, transactions } from "../db/schema";
import { getMonthlySummary } from "./monthly-summary";

let db: TestDatabase;
let teardown: () => Promise<void>;

afterEach(async () => {
  await teardown?.();
});

const jst = (iso: string) => new Date(iso);

describe("getMonthlySummary", () => {
  it("2024年1月の合計・予算・残額・内訳を返す", async () => {
    ({ db, teardown } = await createTestDb());

    const [food] = await db
      .insert(categories)
      .values({ name: "食費", kind: "variable" })
      .returning();
    const [daily] = await db
      .insert(categories)
      .values({ name: "日用品", kind: "variable" })
      .returning();

    await db.insert(transactions).values([
      { amount: 3000, storeName: "a", purchasedAt: jst("2024-01-02T10:00:00+09:00"), categoryId: food.id, source: "manual" },
      { amount: 2000, storeName: "b", purchasedAt: jst("2024-01-03T10:00:00+09:00"), categoryId: food.id, source: "manual" },
      { amount: 1000, storeName: "c", purchasedAt: jst("2024-01-04T10:00:00+09:00"), categoryId: daily.id, source: "manual" },
      // 対象月外（集計に含めない）
      { amount: 9999, storeName: "d", purchasedAt: jst("2023-12-31T10:00:00+09:00"), categoryId: food.id, source: "manual" },
    ]);

    await db.insert(budgets).values([
      { categoryId: food.id, month: "2024-01-01", amount: 30_000 },
      { categoryId: daily.id, month: "2024-01-01", amount: 10_000 },
    ]);

    const r = await getMonthlySummary(db, 2024, 1);
    expect(r.totalAmount).toBe(6000);
    expect(r.budgetAmount).toBe(40_000);
    expect(r.remainingAmount).toBe(34_000);
    expect(r.categoryBreakdowns).toHaveLength(2);

    const foodB = r.categoryBreakdowns.find((b) => b.categoryName === "食費")!;
    expect(foodB.amount).toBe(5000);
    expect(foodB.percentage).toBeCloseTo(83.3, 1);

    const dailyB = r.categoryBreakdowns.find((b) => b.categoryName === "日用品")!;
    expect(dailyB.amount).toBe(1000);
    expect(dailyB.percentage).toBeCloseTo(16.7, 1);

    // 過去月なのでペースは null
    expect(foodB.paceStatus).toBeNull();
    expect(foodB.budgetAmount).toBeNull();
  });

  it("取引ゼロなら合計0・内訳空", async () => {
    ({ db, teardown } = await createTestDb());
    const r = await getMonthlySummary(db, 2024, 1);
    expect(r.totalAmount).toBe(0);
    expect(r.budgetAmount).toBe(0);
    expect(r.remainingAmount).toBe(0);
    expect(r.categoryBreakdowns).toEqual([]);
  });
});

describe("getMonthlySummary: 予算の引き継ぎ（有効予算）", () => {
  it("明示行が無い月でも直近月の予算が budgetAmount に反映される", async () => {
    ({ db, teardown } = await createTestDb());
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    // 予算は2023年11月にのみ設定
    await db.insert(budgets).values({ categoryId: food.id, month: "2023-11-01", amount: 40000 });
    await db.insert(transactions).values({
      amount: 3000, storeName: "a", purchasedAt: jst("2024-01-02T10:00:00+09:00"), categoryId: food.id, source: "manual",
    });

    const s = await getMonthlySummary(db, 2024, 1);
    expect(s.budgetAmount).toBe(40000);
    expect(s.remainingAmount).toBe(37000);
  });

  it("引き継ぎ元より後の月で明示変更すると、その月以降は新しい額になる", async () => {
    ({ db, teardown } = await createTestDb());
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await db.insert(budgets).values([
      { categoryId: food.id, month: "2023-11-01", amount: 40000 },
      { categoryId: food.id, month: "2024-01-01", amount: 50000 },
    ]);

    expect((await getMonthlySummary(db, 2023, 12)).budgetAmount).toBe(40000);
    expect((await getMonthlySummary(db, 2024, 2)).budgetAmount).toBe(50000);
  });
});
