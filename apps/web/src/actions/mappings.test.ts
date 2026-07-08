import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createTestDb } from "@/test/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// db シングルトンをテストDBへ差し替える。createTestDb() は { db, client, teardown } を返す
// （計画A提供の戻り値シェイプ）ので db だけを testDb として使う。
const { db: testDb, teardown } = await createTestDb();
vi.mock("@/db/client", () => ({ db: testDb }));

const { categories, transactions, storeCategoryMappings, unclassifiedAlerts, notifications } =
  await import("@/db/schema");
const { upsertStoreMapping, deleteStoreMapping, normalizeStoreName } = await import("./mappings");

afterAll(async () => {
  await teardown();
});

let catId: number;
beforeEach(async () => {
  for (const t of [notifications, unclassifiedAlerts, transactions, storeCategoryMappings, categories]) {
    await testDb.delete(t);
  }
  const [c] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
  catId = c.id;
});

describe("normalizeStoreName", () => {
  it("全角英数を半角に正規化する", () => {
    expect(normalizeStoreName("ＡＢＣ")).toBe("ABC");
  });

  it("前後の空白をトリムする", () => {
    expect(normalizeStoreName("  ABC  ")).toBe("ABC");
  });

  it("全角ハイフン/英数を吸収する", () => {
    expect(normalizeStoreName("セブン－イレブン")).toBe(normalizeStoreName("セブン-イレブン"));
  });
});

describe("upsertStoreMapping", () => {
  it("store_name を NFKC 正規化して保存する", async () => {
    expect((await upsertStoreMapping({ storeName: "ＡＢＣ", categoryId: String(catId) })).errors).toEqual([]);
    const rows = await testDb.select().from(storeCategoryMappings);
    expect(rows).toHaveLength(1);
    expect(rows[0].storeName).toBe("ABC");
    expect(rows[0].categoryId).toBe(catId);
  });

  it("同一 store_name（正規化後）が既存の場合は upsert（カテゴリを更新）する", async () => {
    await testDb.insert(storeCategoryMappings).values({ storeName: "ABC", categoryId: catId });
    const [otherCat] = await testDb
      .insert(categories)
      .values({ name: "日用品", kind: "variable", sortOrder: 1 })
      .returning();

    const res = await upsertStoreMapping({ storeName: "ＡＢＣ", categoryId: String(otherCat.id) });
    expect(res.errors).toEqual([]);
    const rows = await testDb.select().from(storeCategoryMappings);
    expect(rows).toHaveLength(1);
    expect(rows[0].categoryId).toBe(otherCat.id);
  });

  it("マッピング作成時に同名の未分類取引を事後分類し未分類件数を再計算する（spec §5.6）", async () => {
    await testDb
      .insert(transactions)
      .values({ amount: 100, storeName: "ＡＢＣ", purchasedAt: new Date(), source: "manual", categoryId: null });
    const res = await upsertStoreMapping({ storeName: "ABC", categoryId: String(catId) });
    expect(res.errors).toEqual([]);
    const txns = await testDb.select().from(transactions);
    expect(txns[0].categoryId).toBe(catId); // 未分類が分類された
    expect(await testDb.select().from(unclassifiedAlerts)).toHaveLength(0); // count 0 → 削除
  });

  it("店名が異なる未分類取引は分類しない", async () => {
    await testDb
      .insert(transactions)
      .values({ amount: 100, storeName: "別の店", purchasedAt: new Date(), source: "manual", categoryId: null });
    const res = await upsertStoreMapping({ storeName: "ABC", categoryId: String(catId) });
    expect(res.errors).toEqual([]);
    const [txn] = await testDb.select().from(transactions);
    expect(txn.categoryId).toBeNull();
  });

  it("店名が空はバリデーションエラー", async () => {
    const res = await upsertStoreMapping({ storeName: "  ", categoryId: String(catId) });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(storeCategoryMappings)).toHaveLength(0);
  });

  it("カテゴリ未選択はバリデーションエラー", async () => {
    const res = await upsertStoreMapping({ storeName: "ABC", categoryId: "" });
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

describe("deleteStoreMapping", () => {
  it("既存マッピングを削除できる", async () => {
    const [m] = await testDb.insert(storeCategoryMappings).values({ storeName: "ABC", categoryId: catId }).returning();
    const res = await deleteStoreMapping({ id: String(m.id) });
    expect(res.errors).toEqual([]);
    expect(await testDb.select().from(storeCategoryMappings)).toHaveLength(0);
  });

  it("存在しないIDはエラーを返す", async () => {
    const res = await deleteStoreMapping({ id: "999999" });
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
