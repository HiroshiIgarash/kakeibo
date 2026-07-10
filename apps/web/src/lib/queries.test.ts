import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDatabase } from "@/test/db";
import { categories, transactions, storeCategoryMappings, budgets } from "@/db/schema";
import {
  loadRecentTransactions,
  loadTransactionsByMonth,
  loadCategories,
  loadStoreMappings,
  loadBudgetSettingsView,
} from "./queries";

let db: TestDatabase;
let teardown: () => Promise<void>;

beforeEach(async () => {
  ({ db, teardown } = await createTestDb());
});

afterEach(async () => {
  await teardown();
});

describe("loadTransactionsByMonth", () => {
  it("指定月の取引を purchasedAt 降順・id文字列・JST日付で返す", async () => {
    const [cat] = await db
      .insert(categories)
      .values({ name: "食費", kind: "variable", sortOrder: 0 })
      .returning();
    await db.insert(transactions).values([
      {
        amount: 100,
        storeName: "A",
        purchasedAt: new Date("2026-07-01T03:00:00Z"),
        source: "manual",
        categoryId: cat.id,
      },
      {
        amount: 200,
        storeName: "B",
        purchasedAt: new Date("2026-07-15T03:00:00Z"),
        source: "manual",
        categoryId: null,
      },
      {
        amount: 300,
        storeName: "C",
        purchasedAt: new Date("2026-06-30T03:00:00Z"),
        source: "manual",
        categoryId: null,
      },
    ]);
    const rows = await loadTransactionsByMonth(db, 2026, 7);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ storeName: "B", purchasedAt: "2026-07-15", category: null });
    expect(rows[1]).toMatchObject({ storeName: "A", purchasedAt: "2026-07-01" });
    expect(typeof rows[0].id).toBe("string");
    expect(rows[1].category?.name).toBe("食費");
    expect(typeof rows[1].category?.id).toBe("string");
  });
});

describe("loadRecentTransactions", () => {
  it("limit 件を purchasedAt 降順で返す", async () => {
    await db.insert(transactions).values([
      {
        amount: 1,
        storeName: "A",
        purchasedAt: new Date("2026-07-01T03:00:00Z"),
        source: "manual",
        categoryId: null,
      },
      {
        amount: 2,
        storeName: "B",
        purchasedAt: new Date("2026-07-05T03:00:00Z"),
        source: "manual",
        categoryId: null,
      },
    ]);
    const rows = await loadRecentTransactions(db, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].storeName).toBe("B");
  });
});

describe("loadCategories", () => {
  it("sortOrder 昇順で kind をそのまま返す", async () => {
    await db.insert(categories).values([
      { name: "住居", kind: "fixed", sortOrder: 1 },
      { name: "食費", kind: "variable", sortOrder: 0 },
    ]);
    const rows = await loadCategories(db);
    expect(rows.map((c) => c.name)).toEqual(["食費", "住居"]);
    expect(rows[0]).toMatchObject({ kind: "variable" });
    expect(typeof rows[0].id).toBe("string");
  });
});

describe("loadStoreMappings", () => {
  it("storeName 昇順・category 同梱で返す", async () => {
    const [cat] = await db
      .insert(categories)
      .values({ name: "食費", kind: "variable", sortOrder: 0, color: "#fff" })
      .returning();
    await db.insert(storeCategoryMappings).values([
      { storeName: "ローソン", categoryId: cat.id },
      { storeName: "イオン", categoryId: cat.id },
    ]);
    const rows = await loadStoreMappings(db);
    expect(rows.map((m) => m.storeName)).toEqual(["イオン", "ローソン"]);
    expect(rows[0].category).toMatchObject({ name: "食費", color: "#fff" });
    expect(typeof rows[0].categoryId).toBe("string");
  });
});

describe("loadBudgetSettingsView", () => {
  it("全カテゴリがsortOrder順に並び、対象月の予算がjoinされる（未設定はnull）", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 1 }).returning();
    const [daily] = await db.insert(categories).values({ name: "日用品", kind: "variable", sortOrder: 0 }).returning();
    await db.insert(budgets).values({ categoryId: food.id, month: "2026-07-01", amount: 40000 });

    const rows = await loadBudgetSettingsView(db, "2026-07-01");
    expect(rows).toHaveLength(2);
    // sortOrder順: 日用品(0) → 食費(1)
    expect(rows[0]).toEqual({ categoryId: String(daily.id), categoryName: "日用品", budgetId: null, amount: null });
    expect(rows[1].categoryName).toBe("食費");
    expect(rows[1].amount).toBe(40000);
    expect(typeof rows[1].budgetId).toBe("string");
  });

  it("対象月以外の予算はjoinされない", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    await db.insert(budgets).values({ categoryId: food.id, month: "2026-06-01", amount: 30000 });

    const rows = await loadBudgetSettingsView(db, "2026-07-01");
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBeNull();
    expect(rows[0].budgetId).toBeNull();
  });
});
