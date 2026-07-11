import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { createTestDb, resetTestDb } from "../test/db";
import { categories, budgets, transactions } from "../db/schema";
import { getMonthlySummary } from "./monthly-summary";

const { db, client, teardown } = await createTestDb();

beforeEach(async () => {
  await resetTestDb(client);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await teardown();
});

const jst = (iso: string) => new Date(iso);

describe("getMonthlySummary", () => {
  it("2024年1月の合計・予算・残額・内訳を返す", async () => {
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

    // 過去月: ペース系は null だが予算情報は付く（過去月の進捗表示用）
    expect(foodB.paceStatus).toBeNull();
    expect(foodB.budgetAmount).toBe(30_000);
    expect(foodB.remainingAmount).toBe(25_000);
    expect(foodB.dailyAmount).toBeNull();
  });

  it("取引ゼロなら合計0・内訳空", async () => {
    const r = await getMonthlySummary(db, 2024, 1);
    expect(r.totalAmount).toBe(0);
    expect(r.budgetAmount).toBe(0);
    expect(r.remainingAmount).toBe(0);
    expect(r.categoryBreakdowns).toEqual([]);
  });
});

describe("getMonthlySummary: 予算の引き継ぎ（有効予算）", () => {
  it("明示行が無い月でも直近月の予算が budgetAmount に反映される", async () => {
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
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await db.insert(budgets).values([
      { categoryId: food.id, month: "2023-11-01", amount: 40000 },
      { categoryId: food.id, month: "2024-01-01", amount: 50000 },
    ]);

    expect((await getMonthlySummary(db, 2023, 12)).budgetAmount).toBe(40000);
    expect((await getMonthlySummary(db, 2024, 2)).budgetAmount).toBe(50000);
  });
});

describe("getMonthlySummary: 親カテゴリ単位集計と子内訳", () => {
  it("子カテゴリの取引は親単位で集計され、子内訳が金額降順で付く", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [snack] = await db
      .insert(categories)
      .values({ name: "お菓子", kind: "variable", parentId: food.id })
      .returning();
    const [outing] = await db
      .insert(categories)
      .values({ name: "外出", kind: "variable", parentId: food.id })
      .returning();
    const [hobby] = await db.insert(categories).values({ name: "趣味", kind: "variable" }).returning();
    const [vtuber] = await db
      .insert(categories)
      .values({ name: "VTuber", kind: "variable", parentId: hobby.id })
      .returning();

    await db.insert(transactions).values([
      { amount: 3000, storeName: "a", purchasedAt: jst("2024-01-05T10:00:00+09:00"), categoryId: snack.id, source: "manual" },
      { amount: 7000, storeName: "b", purchasedAt: jst("2024-01-06T10:00:00+09:00"), categoryId: outing.id, source: "manual" },
      { amount: 1000, storeName: "c", purchasedAt: jst("2024-01-07T10:00:00+09:00"), categoryId: vtuber.id, source: "manual" },
    ]);

    const r = await getMonthlySummary(db, 2024, 1);
    // 親カテゴリ単位（食費・趣味）に集約され、子カテゴリ自体は行として出てこない
    expect(r.categoryBreakdowns).toHaveLength(2);

    const foodB = r.categoryBreakdowns.find((b) => b.categoryName === "食費")!;
    expect(foodB.amount).toBe(10000);
    expect(foodB.children).toEqual([
      { categoryId: outing.id, categoryName: "外出", amount: 7000 },
      { categoryId: snack.id, categoryName: "お菓子", amount: 3000 },
    ]);

    const hobbyB = r.categoryBreakdowns.find((b) => b.categoryName === "趣味")!;
    expect(hobbyB.amount).toBe(1000);
    expect(hobbyB.children).toEqual([{ categoryId: vtuber.id, categoryName: "VTuber", amount: 1000 }]);
  });

  it("親カテゴリへの直付け取引は children に含めず親行の amount にのみ計上する", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [snack] = await db
      .insert(categories)
      .values({ name: "お菓子", kind: "variable", parentId: food.id })
      .returning();

    await db.insert(transactions).values([
      { amount: 2000, storeName: "a", purchasedAt: jst("2024-01-05T10:00:00+09:00"), categoryId: food.id, source: "manual" },
      { amount: 3000, storeName: "b", purchasedAt: jst("2024-01-06T10:00:00+09:00"), categoryId: snack.id, source: "manual" },
    ]);

    const r = await getMonthlySummary(db, 2024, 1);
    const foodB = r.categoryBreakdowns.find((b) => b.categoryName === "食費")!;
    expect(foodB.amount).toBe(5000);
    expect(foodB.children).toEqual([{ categoryId: snack.id, categoryName: "お菓子", amount: 3000 }]);
  });

  it("過去月で実績が予算超過なら remainingAmount がマイナス", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await db.insert(budgets).values({ categoryId: food.id, month: "2024-01-01", amount: 10_000 });
    await db.insert(transactions).values({
      amount: 13000, storeName: "a", purchasedAt: jst("2024-01-10T10:00:00+09:00"), categoryId: food.id, source: "manual",
    });

    const r = await getMonthlySummary(db, 2024, 1);
    const foodB = r.categoryBreakdowns.find((b) => b.categoryName === "食費")!;
    expect(foodB.budgetAmount).toBe(10_000);
    expect(foodB.remainingAmount).toBe(-3000);
    expect(foodB.paceStatus).toBeNull();
    expect(foodB.dailyAmount).toBeNull();
  });

  it("予算設定済みで支出ゼロのカテゴリも breakdown に含まれる（過去月）", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [fun] = await db.insert(categories).values({ name: "娯楽", kind: "variable" }).returning();
    await db.insert(budgets).values([
      { categoryId: food.id, month: "2024-01-01", amount: 30_000 },
      { categoryId: fun.id, month: "2024-01-01", amount: 10_000 },
    ]);
    // 取引は食費のみ。娯楽は支出ゼロ
    await db.insert(transactions).values({
      amount: 5000, storeName: "a", purchasedAt: jst("2024-01-10T10:00:00+09:00"), categoryId: food.id, source: "manual",
    });

    const r = await getMonthlySummary(db, 2024, 1);
    expect(r.categoryBreakdowns).toHaveLength(2);
    const funB = r.categoryBreakdowns.find((b) => b.categoryName === "娯楽")!;
    expect(funB.amount).toBe(0);
    expect(funB.percentage).toBe(0);
    expect(funB.budgetAmount).toBe(10_000);
    expect(funB.remainingAmount).toBe(10_000);
    expect(funB.paceStatus).toBeNull();
    expect(funB.dailyAmount).toBeNull();
    expect(funB.children).toEqual([]);
  });

  it("予算設定済みで支出ゼロのカテゴリは当月ならペース情報も付く", async () => {
    vi.setSystemTime(new Date("2026-07-10T03:00:00+09:00"));
    const [fun] = await db.insert(categories).values({ name: "娯楽", kind: "variable" }).returning();
    await db.insert(budgets).values({ categoryId: fun.id, month: "2026-07-01", amount: 10_000 });

    const r = await getMonthlySummary(db, 2026, 7);
    const funB = r.categoryBreakdowns.find((b) => b.categoryName === "娯楽")!;
    expect(funB.amount).toBe(0);
    expect(funB.budgetAmount).toBe(10_000);
    expect(funB.paceStatus).not.toBeNull();
    expect(funB.dailyAmount).not.toBeNull();
  });

  it("親の有効予算に対して子取引合算でペース計算される", async () => {
    vi.setSystemTime(new Date("2026-07-10T03:00:00+09:00"));
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [snack] = await db
      .insert(categories)
      .values({ name: "お菓子", kind: "variable", parentId: food.id })
      .returning();
    await db.insert(budgets).values({ categoryId: food.id, month: "2026-07-01", amount: 30_000 });
    // 予算・取引とも子（お菓子）のみ。親（食費）には直付け取引が無い
    await db.insert(transactions).values({
      amount: 9000,
      storeName: "a",
      purchasedAt: jst("2026-07-05T10:00:00+09:00"),
      categoryId: snack.id,
      source: "manual",
    });

    const r = await getMonthlySummary(db, 2026, 7);
    const foodB = r.categoryBreakdowns.find((b) => b.categoryName === "食費")!;
    expect(foodB.budgetAmount).toBe(30_000);
    expect(foodB.remainingAmount).toBe(21_000);
    expect(foodB.paceStatus).not.toBeNull();
  });
});
