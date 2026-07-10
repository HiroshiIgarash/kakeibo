import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createTestDb } from "@/test/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { db: testDb, teardown } = await createTestDb();
vi.mock("@/db/client", () => ({ db: testDb }));

const { categories, budgetAlertSettings, paceAlertSettings } = await import("@/db/schema");
const { upsertBudgetAlertSetting, upsertPaceAlertSetting } = await import("./alert-settings");

afterAll(async () => {
  await teardown();
});

let catId: number;
beforeEach(async () => {
  await testDb.delete(budgetAlertSettings);
  await testDb.delete(paceAlertSettings);
  await testDb.delete(categories);
  const [c] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
  catId = c.id;
});

describe("upsertBudgetAlertSetting", () => {
  it("同カテゴリで upsert される", async () => {
    expect(
      (await upsertBudgetAlertSetting({ categoryId: String(catId), threshold: 80, threshold2: 100, isActive: true }))
        .errors,
    ).toEqual([]);
    expect(
      (await upsertBudgetAlertSetting({ categoryId: String(catId), threshold: 70, threshold2: null, isActive: false }))
        .errors,
    ).toEqual([]);
    const rows = await testDb.select().from(budgetAlertSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ threshold: 70, threshold2: null, isActive: false });
  });

  it("threshold2 <= threshold は拒否", async () => {
    const res = await upsertBudgetAlertSetting({
      categoryId: String(catId),
      threshold: 100,
      threshold2: 80,
      isActive: true,
    });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("threshold が0以下は拒否", async () => {
    const res = await upsertBudgetAlertSetting({
      categoryId: String(catId),
      threshold: 0,
      threshold2: null,
      isActive: true,
    });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("threshold が200超は拒否", async () => {
    const res = await upsertBudgetAlertSetting({
      categoryId: String(catId),
      threshold: 201,
      threshold2: null,
      isActive: true,
    });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("categoryId=null（全体）も作成できる", async () => {
    expect(
      (await upsertBudgetAlertSetting({ categoryId: null, threshold: 90, threshold2: null, isActive: true })).errors,
    ).toEqual([]);
    const rows = await testDb.select().from(budgetAlertSettings);
    expect(rows[0].categoryId).toBeNull();
  });

  it("categoryId=null と特定カテゴリのレコードは別々に upsert される", async () => {
    await upsertBudgetAlertSetting({ categoryId: null, threshold: 90, threshold2: null, isActive: true });
    await upsertBudgetAlertSetting({ categoryId: String(catId), threshold: 80, threshold2: null, isActive: true });
    const rows = await testDb.select().from(budgetAlertSettings);
    expect(rows).toHaveLength(2);
  });

  it("子カテゴリへの設定は拒否", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費2", kind: "variable" }).returning();
    const [child] = await testDb.insert(categories).values({ name: "お菓子", kind: "variable", parentId: parent.id }).returning();
    const res = await upsertBudgetAlertSetting({ categoryId: String(child.id), threshold: 80, threshold2: null, isActive: true });
    expect(res.errors).toEqual(["親カテゴリを指定してください"]);
    expect(await testDb.select().from(budgetAlertSettings)).toHaveLength(0);
  });

  it("存在しないカテゴリへの設定は拒否", async () => {
    const res = await upsertBudgetAlertSetting({ categoryId: "999999", threshold: 80, threshold2: null, isActive: true });
    expect(res.errors).toEqual(["カテゴリが見つかりません"]);
    expect(await testDb.select().from(budgetAlertSettings)).toHaveLength(0);
  });

  it("categoryId=null（全体設定）は検証をスキップして成功する", async () => {
    const res = await upsertBudgetAlertSetting({ categoryId: null, threshold: 90, threshold2: null, isActive: true });
    expect(res.errors).toEqual([]);
  });
});

describe("upsertPaceAlertSetting", () => {
  it("同カテゴリで upsert される", async () => {
    expect(
      (await upsertPaceAlertSetting({ categoryId: String(catId), threshold: 110, activeFromDay: 5, isActive: true }))
        .errors,
    ).toEqual([]);
    expect(
      (await upsertPaceAlertSetting({ categoryId: String(catId), threshold: 120, activeFromDay: 10, isActive: false }))
        .errors,
    ).toEqual([]);
    const rows = await testDb.select().from(paceAlertSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ threshold: 120, activeFromDay: 10, isActive: false });
  });

  it("threshold 100以下は拒否", async () => {
    const res = await upsertPaceAlertSetting({ categoryId: String(catId), threshold: 100, activeFromDay: 5, isActive: true });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("threshold 500超は拒否", async () => {
    const res = await upsertPaceAlertSetting({ categoryId: String(catId), threshold: 501, activeFromDay: 5, isActive: true });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("activeFromDay が0以下は拒否", async () => {
    const res = await upsertPaceAlertSetting({ categoryId: String(catId), threshold: 110, activeFromDay: 0, isActive: true });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("activeFromDay が28超は拒否", async () => {
    const res = await upsertPaceAlertSetting({ categoryId: String(catId), threshold: 110, activeFromDay: 29, isActive: true });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("categoryId が空文字は拒否", async () => {
    const res = await upsertPaceAlertSetting({ categoryId: "", threshold: 110, activeFromDay: 5, isActive: true });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("子カテゴリへの設定は拒否", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費2", kind: "variable" }).returning();
    const [child] = await testDb.insert(categories).values({ name: "お菓子", kind: "variable", parentId: parent.id }).returning();
    const res = await upsertPaceAlertSetting({ categoryId: String(child.id), threshold: 110, activeFromDay: 5, isActive: true });
    expect(res.errors).toEqual(["親カテゴリを指定してください"]);
    expect(await testDb.select().from(paceAlertSettings)).toHaveLength(0);
  });

  it("存在しないカテゴリへの設定は拒否", async () => {
    const res = await upsertPaceAlertSetting({ categoryId: "999999", threshold: 110, activeFromDay: 5, isActive: true });
    expect(res.errors).toEqual(["カテゴリが見つかりません"]);
    expect(await testDb.select().from(paceAlertSettings)).toHaveLength(0);
  });
});
