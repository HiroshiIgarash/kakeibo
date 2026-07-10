import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createTestDb } from "@/test/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { db: testDb, teardown } = await createTestDb();
vi.mock("@/db/client", () => ({ db: testDb }));

const { categories, budgets } = await import("@/db/schema");
const { upsertBudget, deleteBudget } = await import("./budgets");

afterAll(async () => {
  await teardown();
});

let catId: number;
beforeEach(async () => {
  await testDb.delete(budgets);
  await testDb.delete(categories);
  const [c] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
  catId = c.id;
});

describe("upsertBudget", () => {
  it("新規作成し、同カテゴリ・同月なら金額を更新（upsert）", async () => {
    expect((await upsertBudget({ categoryId: String(catId), amount: 1000, month: "2026-07-01" })).errors).toEqual([]);
    expect((await upsertBudget({ categoryId: String(catId), amount: 2000, month: "2026-07-01" })).errors).toEqual([]);
    const rows = await testDb.select().from(budgets);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(2000);
  });

  it("金額0以下は拒否", async () => {
    expect((await upsertBudget({ categoryId: String(catId), amount: 0, month: "2026-07-01" })).errors.length).toBeGreaterThan(0);
  });

  it("月の形式が不正なら拒否", async () => {
    expect(
      (await upsertBudget({ categoryId: String(catId), amount: 1000, month: "2026/07" })).errors.length,
    ).toBeGreaterThan(0);
  });

  it("存在しない月（13月等）は拒否", async () => {
    expect(
      (await upsertBudget({ categoryId: String(catId), amount: 1000, month: "2026-13-01" })).errors.length,
    ).toBeGreaterThan(0);
    expect(
      (await upsertBudget({ categoryId: String(catId), amount: 1000, month: "2026-00-01" })).errors.length,
    ).toBeGreaterThan(0);
  });

  it("非01日の入力は月初キー 'YYYY-MM-01' に正規化して保存される", async () => {
    expect((await upsertBudget({ categoryId: String(catId), amount: 1000, month: "2026-07-15" })).errors).toEqual([]);
    // 同月の別日入力も同一レコードへの upsert として扱われる
    expect((await upsertBudget({ categoryId: String(catId), amount: 3000, month: "2026-07-20" })).errors).toEqual([]);
    const rows = await testDb.select().from(budgets);
    expect(rows).toHaveLength(1);
    expect(rows[0].month).toBe("2026-07-01");
    expect(rows[0].amount).toBe(3000);
  });

  it("異なる月なら別レコードとして作成される", async () => {
    await upsertBudget({ categoryId: String(catId), amount: 1000, month: "2026-07-01" });
    await upsertBudget({ categoryId: String(catId), amount: 1500, month: "2026-08-01" });
    const rows = await testDb.select().from(budgets);
    expect(rows).toHaveLength(2);
  });

  it("子カテゴリへの予算設定は拒否", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費2", kind: "variable" }).returning();
    const [child] = await testDb.insert(categories).values({ name: "お菓子", kind: "variable", parentId: parent.id }).returning();
    const res = await upsertBudget({ categoryId: String(child.id), amount: 10000, month: "2026-07-01" });
    expect(res.errors).toEqual(["親カテゴリを指定してください"]);
    expect(await testDb.select().from(budgets)).toHaveLength(0);
  });

  it("存在しないカテゴリへの予算設定は拒否", async () => {
    const res = await upsertBudget({ categoryId: "999999", amount: 10000, month: "2026-07-01" });
    expect(res.errors).toEqual(["カテゴリが見つかりません"]);
    expect(await testDb.select().from(budgets)).toHaveLength(0);
  });
});

describe("deleteBudget", () => {
  it("存在するIDを削除できる", async () => {
    const [b] = await testDb.insert(budgets).values({ categoryId: catId, month: "2026-07-01", amount: 1000 }).returning();
    const result = await deleteBudget({ id: String(b.id) });
    expect(result.errors).toEqual([]);
    const rows = await testDb.select().from(budgets);
    expect(rows).toHaveLength(0);
  });

  it("存在しないIDはエラーを返す", async () => {
    const result = await deleteBudget({ id: "999999" });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
