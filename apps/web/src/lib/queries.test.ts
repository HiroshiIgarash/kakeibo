import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createTestDb, resetTestDb } from "@/test/db";
import { categories, transactions, storeCategoryMappings, budgets } from "@/db/schema";
import {
  loadRecentTransactions,
  loadTransactionsByMonth,
  loadCategories,
  loadCategoryOptions,
  loadParentCategoryOptions,
  loadStoreMappings,
  loadBudgetSettingsView,
  loadUnclassifiedGroups,
} from "./queries";

const { db, client, teardown } = await createTestDb();

beforeEach(async () => {
  await resetTestDb(client);
});

afterAll(async () => {
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
    expect(rows[0]).toEqual({
      categoryId: String(daily.id),
      categoryName: "日用品",
      budgetId: null,
      amount: null,
      inherited: null,
    });
    expect(rows[1].categoryName).toBe("食費");
    expect(rows[1].amount).toBe(40000);
    expect(typeof rows[1].budgetId).toBe("string");
    expect(rows[1].inherited).toBeNull(); // 明示行があれば引き継ぎ情報は付かない
  });

  it("明示行が無い月は直近月の設定を inherited として返す", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    await db.insert(budgets).values({ categoryId: food.id, month: "2026-06-01", amount: 30000 });

    const rows = await loadBudgetSettingsView(db, "2026-07-01");
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBeNull();
    expect(rows[0].budgetId).toBeNull();
    expect(rows[0].inherited).toEqual({ amount: 30000, fromMonth: "2026-06-01" });
  });

  it("未来月の設定は inherited に含めない", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    await db.insert(budgets).values({ categoryId: food.id, month: "2026-08-01", amount: 50000 });

    const rows = await loadBudgetSettingsView(db, "2026-07-01");
    expect(rows[0].inherited).toBeNull();
  });
});

describe("loadUnclassifiedGroups", () => {
  it("未分類取引を店名でグルーピングし件数降順で返す", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    await db.insert(transactions).values([
      { amount: 100, storeName: "ベルク", purchasedAt: new Date("2026-07-01T10:00:00+09:00"), categoryId: null, source: "email" },
      { amount: 200, storeName: "ベルク", purchasedAt: new Date("2026-07-02T10:00:00+09:00"), categoryId: null, source: "email" },
      { amount: 300, storeName: "セブン", purchasedAt: new Date("2026-07-03T10:00:00+09:00"), categoryId: null, source: "email" },
      // 分類済みは対象外
      { amount: 999, storeName: "ベルク", purchasedAt: new Date("2026-07-04T10:00:00+09:00"), categoryId: food.id, source: "email" },
    ]);

    const groups = await loadUnclassifiedGroups(db);
    expect(groups).toEqual([
      { storeName: "ベルク", count: 2, totalAmount: 300 },
      { storeName: "セブン", count: 1, totalAmount: 300 },
    ]);
  });

  it("同数の場合は店名昇順、未分類ゼロなら空配列", async () => {
    expect(await loadUnclassifiedGroups(db)).toEqual([]);
    await db.insert(transactions).values([
      { amount: 100, storeName: "ローソン", purchasedAt: new Date("2026-07-01T10:00:00+09:00"), categoryId: null, source: "manual" },
      { amount: 100, storeName: "セブン", purchasedAt: new Date("2026-07-01T11:00:00+09:00"), categoryId: null, source: "manual" },
    ]);
    const groups = await loadUnclassifiedGroups(db);
    expect(groups.map((g) => g.storeName)).toEqual(["セブン", "ローソン"]);
  });
});

describe("loadFailedInboundEmails", () => {
  it("failedのみをcreated_at降順で返し、本文からプリフィルを抽出する", async () => {
    const { inboundEmails } = await import("@/db/schema");
    const { loadFailedInboundEmails } = await import("./queries");
    await db.insert(inboundEmails).values([
      { messageId: "<f1@x>", from: "statement@vpass.ne.jp", subject: "ご利用のお知らせ", rawBody: "◇利用日：2026/06/09 20:32\n◇利用先：GOOGLE*YOUTUBE MEMBER\n◇利用金額：990.00 JPY", status: "failed", errorMessage: "抽出失敗: 利用金額", createdAt: new Date("2026-06-09T12:00:00Z") },
      { messageId: "<f2@x>", from: "statement@vpass.ne.jp", subject: "ご利用のお知らせ", rawBody: "本文なし", status: "failed", errorMessage: "err", createdAt: new Date("2026-07-01T12:00:00Z") },
      { messageId: "<ok@x>", from: "statement@vpass.ne.jp", subject: "ご利用のお知らせ", rawBody: "x", status: "skipped", createdAt: new Date("2026-07-02T12:00:00Z") },
    ]);
    const rows = await loadFailedInboundEmails(db);
    expect(rows).toHaveLength(2);
    expect(rows[0].receivedAt).toBe("2026-07-01"); // 降順
    expect(rows[0].storeName).toBeUndefined();
    expect(rows[1]).toMatchObject({
      storeName: "GOOGLE*YOUTUBE MEMBER",
      date: "2026-06-09",
      amountRaw: "990.00 JPY",
      errorMessage: "抽出失敗: 利用金額",
    });
    expect(typeof rows[1].id).toBe("string");
  });
});

describe("階層ローダー", () => {
  it("loadCategoryOptions は子のみ返し、親名・親colorを同梱する", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", color: "#f00", sortOrder: 1 }).returning();
    await db.insert(categories).values({ name: "趣味", kind: "variable", sortOrder: 2 }); // 子なし親
    const [snack] = await db.insert(categories).values({ name: "お菓子", kind: "variable", parentId: food.id, sortOrder: 1 }).returning();
    const options = await loadCategoryOptions(db);
    expect(options).toEqual([
      { id: String(snack.id), name: "お菓子", color: "#f00", parentId: String(food.id), parentName: "食費" },
    ]);
  });

  it("loadParentCategoryOptions は親のみ返す", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", color: "#f00", sortOrder: 1 }).returning();
    await db.insert(categories).values({ name: "お菓子", kind: "variable", parentId: food.id }).returning();
    const options = await loadParentCategoryOptions(db);
    expect(options).toEqual([{ id: String(food.id), name: "食費", color: "#f00" }]);
  });

  it("loadCategories は parentId と sortOrder を含む", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 3 }).returning();
    const rows = await loadCategories(db);
    expect(rows[0]).toMatchObject({ id: String(food.id), parentId: null, sortOrder: 3 });
  });

  it("取引の category に親情報が付き、色は親のcolorになる", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", color: "#f00" }).returning();
    const [snack] = await db.insert(categories).values({ name: "お菓子", kind: "variable", parentId: food.id }).returning();
    await db.insert(transactions).values({ amount: 100, storeName: "A", purchasedAt: new Date(), source: "manual", categoryId: snack.id });
    const rows = await loadRecentTransactions(db, 10);
    expect(rows[0].category).toEqual({
      id: String(snack.id),
      name: "お菓子",
      color: "#f00",
      parentId: String(food.id),
      parentName: "食費",
    });
  });

  it("loadBudgetSettingsView は親カテゴリのみ列挙する", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 1 }).returning();
    await db.insert(categories).values({ name: "お菓子", kind: "variable", parentId: food.id });
    const rows = await loadBudgetSettingsView(db, "2026-07-01");
    expect(rows.map((r) => r.categoryName)).toEqual(["食費"]);
  });
});
