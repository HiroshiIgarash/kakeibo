import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createTestDb } from "@/test/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// db シングルトンをテストDBへ差し替える。createTestDb() は { db, client, teardown } を返す
// （計画A提供の戻り値シェイプ）ので db だけを testDb として使う。
const { db: testDb, teardown } = await createTestDb();
vi.mock("@/db/client", () => ({ db: testDb }));

const { categories, transactions, budgetAlerts } = await import("@/db/schema");
const { createCategory, updateCategory, deleteCategory } = await import("./categories");

afterAll(async () => {
  await teardown();
});

beforeEach(async () => {
  for (const t of [transactions, budgetAlerts, categories]) await testDb.delete(t);
});

describe("createCategory", () => {
  it("作成したカテゴリのidを文字列で返す", async () => {
    const res = await createCategory({ name: "趣味", kind: "variable", color: null });
    expect(res.errors).toEqual([]);
    expect(typeof res.id).toBe("string");
    const rows = await testDb.select().from(categories);
    expect(String(rows[0].id)).toBe(res.id);
  });

  it("kind 'fixed'/'variable' で作成できる", async () => {
    const res = await createCategory({ name: "住居", kind: "fixed", color: "#111" });
    expect(res.errors).toEqual([]);
    const rows = await testDb.select().from(categories);
    expect(rows[0]).toMatchObject({ name: "住居", kind: "fixed", color: "#111" });
  });

  it("不正な kind は拒否", async () => {
    const res = await createCategory({ name: "x", kind: "FixedCategory" as never, color: null });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("名前空欄は拒否", async () => {
    const res = await createCategory({ name: "  ", kind: "variable", color: null });
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

describe("createCategory (階層)", () => {
  it("parentId 付きで子カテゴリを作成でき、kind は親からコピーされる", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "fixed" }).returning();
    const res = await createCategory({ name: "お菓子", parentId: String(parent.id) });
    expect(res.errors).toEqual([]);
    const rows = await testDb.select().from(categories);
    const child = rows.find((r) => r.parentId === parent.id)!;
    expect(child).toMatchObject({ name: "お菓子", kind: "fixed", parentId: parent.id, color: null });
    expect(res.id).toBe(String(child.id));
  });

  it("子カテゴリの下に子は作れない（孫禁止）", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [child] = await testDb.insert(categories).values({ name: "お菓子", kind: "variable", parentId: parent.id }).returning();
    const res = await createCategory({ name: "駄菓子", parentId: String(child.id) });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(categories)).toHaveLength(2);
  });

  it("存在しない parentId はエラー", async () => {
    const res = await createCategory({ name: "お菓子", parentId: "999999" });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("親作成で kind 未指定はエラー", async () => {
    const res = await createCategory({ name: "食費" });
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

describe("updateCategory", () => {
  it("名前・色を更新できる", async () => {
    const [cat] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    const res = await updateCategory({ id: String(cat.id), name: "食費（更新）", color: "#222" });
    expect(res.errors).toEqual([]);
    const [updated] = await testDb.select().from(categories);
    expect(updated.name).toBe("食費（更新）");
    expect(updated.color).toBe("#222");
  });

  it("存在しないIDはエラーを返す", async () => {
    const res = await updateCategory({ id: "999999", name: "x", color: null });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("名前空欄は拒否", async () => {
    const [cat] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    const res = await updateCategory({ id: String(cat.id), name: "  ", color: null });
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

describe("deleteCategory", () => {
  it("取引が紐づくカテゴリは削除できない（spec §4.3）", async () => {
    const [cat] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    await testDb.insert(transactions).values({ amount: 1, storeName: "A", purchasedAt: new Date(), source: "manual", categoryId: cat.id });
    const res = await deleteCategory({ id: String(cat.id) });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(categories)).toHaveLength(1);
  });

  it("budgetAlertsが紐づくカテゴリは削除できない（spec §4.3）", async () => {
    const [cat] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    await testDb
      .insert(budgetAlerts)
      .values({ categoryId: cat.id, month: "2026-07-01", threshold: 80, usagePercent: 85 });
    const res = await deleteCategory({ id: String(cat.id) });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(categories)).toHaveLength(1);
  });

  it("参照のないカテゴリは削除できる", async () => {
    const [cat] = await testDb.insert(categories).values({ name: "娯楽", kind: "variable", sortOrder: 0 }).returning();
    const res = await deleteCategory({ id: String(cat.id) });
    expect(res.errors).toEqual([]);
    expect(await testDb.select().from(categories)).toHaveLength(0);
  });

  it("子カテゴリは再帰削除される", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "親", kind: "variable", sortOrder: 0 }).returning();
    const [child] = await testDb
      .insert(categories)
      .values({ name: "子", kind: "variable", sortOrder: 0, parentId: parent.id })
      .returning();
    const res = await deleteCategory({ id: String(parent.id) });
    expect(res.errors).toEqual([]);
    expect(await testDb.select().from(categories)).toHaveLength(0);
    expect(child).toBeDefined();
  });

  it("子カテゴリに参照があれば親ごと削除できない", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "親", kind: "variable", sortOrder: 0 }).returning();
    const [child] = await testDb
      .insert(categories)
      .values({ name: "子", kind: "variable", sortOrder: 0, parentId: parent.id })
      .returning();
    await testDb.insert(transactions).values({ amount: 1, storeName: "A", purchasedAt: new Date(), source: "manual", categoryId: child.id });
    const res = await deleteCategory({ id: String(parent.id) });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(categories)).toHaveLength(2);
  });

  it("存在しないIDはエラーを返す", async () => {
    const res = await deleteCategory({ id: "999999" });
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

describe("getCategoryOptions", () => {
  it("子カテゴリのみを id/name/color(親のcolor)/parentId/parentName 形式で返す", async () => {
    const [food] = await testDb
      .insert(categories)
      .values({ name: "食費", kind: "variable", sortOrder: 0, color: "#333" })
      .returning();
    await testDb.insert(categories).values({ name: "お菓子", kind: "variable", sortOrder: 0, parentId: food.id });
    const { getCategoryOptions } = await import("./categories");
    const options = await getCategoryOptions();
    expect(options).toEqual([
      { id: expect.any(String), name: "お菓子", color: "#333", parentId: String(food.id), parentName: "食費" },
    ]);
  });
});
