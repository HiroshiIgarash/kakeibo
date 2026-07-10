import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createTestDb } from "@/test/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// db シングルトンをテストDBへ差し替える。createTestDb() は { db, client, teardown } を返す
// （計画A提供の戻り値シェイプ）ので db だけを testDb として使う。
const { db: testDb, teardown } = await createTestDb();
vi.mock("@/db/client", () => ({ db: testDb }));

const { categories, budgets, budgetAlertSettings, transactions, budgetAlerts, unclassifiedAlerts, notifications } =
  await import("@/db/schema");
const { createTransaction, updateTransaction, deleteTransaction } = await import("./transactions");

afterAll(async () => {
  await teardown();
});

beforeEach(async () => {
  // 各テーブルを truncate（createTestDb がテストごとに新規DBを返すなら不要。ヘルパ仕様に合わせる）
  for (const t of [notifications, budgetAlerts, unclassifiedAlerts, transactions, budgets, budgetAlertSettings, categories]) {
    await testDb.delete(t);
  }
});

describe("createTransaction", () => {
  it("手動作成で source=manual の取引が入り、予算アラートが判定される", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    const [cat] = await testDb
      .insert(categories)
      .values({ name: "お菓子", kind: "variable", sortOrder: 0, parentId: parent.id })
      .returning();
    await testDb.insert(budgets).values({ categoryId: cat.id, month: "2026-07-01", amount: 1000 });
    await testDb.insert(budgetAlertSettings).values({ categoryId: cat.id, threshold: 80, isActive: true });

    const res = await createTransaction({ storeName: "A", amount: 900, purchasedAt: "2026-07-10", categoryId: String(cat.id) });
    expect(res.errors).toEqual([]);
    const txns = await testDb.select().from(transactions);
    expect(txns).toHaveLength(1);
    expect(txns[0].source).toBe("manual");
    const alerts = await testDb.select().from(budgetAlerts);
    expect(alerts).toHaveLength(1); // 90% >= 80%
  });

  it("未分類作成で unclassified_alerts が更新される", async () => {
    const res = await createTransaction({ storeName: "謎の店", amount: 500, purchasedAt: "2026-07-10", categoryId: null });
    expect(res.errors).toEqual([]);
    const ua = await testDb.select().from(unclassifiedAlerts);
    expect(ua[0]?.count).toBe(1);
  });

  it("金額0はバリデーションエラー", async () => {
    const res = await createTransaction({ storeName: "A", amount: 0, purchasedAt: "2026-07-10", categoryId: null });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(transactions)).toHaveLength(0);
  });

  it("createTransaction: 親カテゴリの割当は拒否", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const res = await createTransaction({ storeName: "A", amount: 100, purchasedAt: "2026-07-01", categoryId: String(parent.id) });
    expect(res.errors).toEqual(["子カテゴリを選択してください"]);
    expect(await testDb.select().from(transactions)).toHaveLength(0);
  });

  it("createTransaction: 子カテゴリは割当できる", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [child] = await testDb.insert(categories).values({ name: "お菓子", kind: "variable", parentId: parent.id }).returning();
    const res = await createTransaction({ storeName: "A", amount: 100, purchasedAt: "2026-07-01", categoryId: String(child.id) });
    expect(res.errors).toEqual([]);
  });

  it("createTransaction: 存在しないカテゴリはエラー", async () => {
    const res = await createTransaction({ storeName: "A", amount: 100, purchasedAt: "2026-07-01", categoryId: "999999" });
    expect(res.errors).toEqual(["カテゴリが見つかりません"]);
  });
});

describe("updateTransaction", () => {
  it("既存取引を更新でき、カテゴリ変更後にアラートが判定される", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    const [cat] = await testDb
      .insert(categories)
      .values({ name: "お菓子", kind: "variable", sortOrder: 0, parentId: parent.id })
      .returning();
    await testDb.insert(budgets).values({ categoryId: cat.id, month: "2026-07-01", amount: 1000 });
    await testDb.insert(budgetAlertSettings).values({ categoryId: cat.id, threshold: 80, isActive: true });
    const c = await createTransaction({ storeName: "A", amount: 100, purchasedAt: "2026-07-10", categoryId: null });
    expect(c.errors).toEqual([]);
    const [t] = await testDb.select().from(transactions);

    const res = await updateTransaction({
      id: String(t.id),
      storeName: "B",
      amount: 900,
      purchasedAt: "2026-07-11",
      categoryId: String(cat.id),
    });
    expect(res.errors).toEqual([]);
    const [updated] = await testDb.select().from(transactions);
    expect(updated.storeName).toBe("B");
    expect(updated.amount).toBe(900);
    const alerts = await testDb.select().from(budgetAlerts);
    expect(alerts).toHaveLength(1);
  });

  it("存在しないIDはエラーを返す", async () => {
    const res = await updateTransaction({
      id: "999999",
      storeName: "B",
      amount: 900,
      purchasedAt: "2026-07-11",
      categoryId: null,
    });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("updateTransaction: 親カテゴリの割当は拒否", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [t] = await testDb
      .insert(transactions)
      .values({ storeName: "A", amount: 100, purchasedAt: new Date(), source: "manual" })
      .returning();
    const res = await updateTransaction({
      id: String(t.id),
      storeName: "A",
      amount: 100,
      purchasedAt: "2026-07-01",
      categoryId: String(parent.id),
    });
    expect(res.errors).toEqual(["子カテゴリを選択してください"]);
    const [after] = await testDb.select().from(transactions);
    expect(after.categoryId).toBeNull();
  });
});

describe("deleteTransaction", () => {
  it("削除後に未分類件数が再計算される", async () => {
    const c = await createTransaction({ storeName: "A", amount: 100, purchasedAt: "2026-07-10", categoryId: null });
    expect(c.errors).toEqual([]);
    const [t] = await testDb.select().from(transactions);
    const res = await deleteTransaction({ id: String(t.id) });
    expect(res.errors).toEqual([]);
    expect(await testDb.select().from(transactions)).toHaveLength(0);
    const ua = await testDb.select().from(unclassifiedAlerts);
    expect(ua).toHaveLength(0); // count 0 なら削除される（spec §5.6）
  });

  it("存在しないIDはエラーを返す", async () => {
    const res = await deleteTransaction({ id: "999999" });
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
