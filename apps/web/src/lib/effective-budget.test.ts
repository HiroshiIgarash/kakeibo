import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDatabase } from "@/test/db";
import { categories, budgets } from "@/db/schema";
import { getEffectiveBudget, getEffectiveBudgets } from "./effective-budget";

let db: TestDatabase;
let teardown: () => Promise<void>;

beforeEach(async () => {
  ({ db, teardown } = await createTestDb());
});

afterEach(async () => {
  await teardown();
});

async function seedCategory(name: string, sortOrder = 0): Promise<number> {
  const [c] = await db.insert(categories).values({ name, kind: "variable", sortOrder }).returning();
  return c.id;
}

describe("getEffectiveBudget", () => {
  it("対象月に明示行があればそれを返す", async () => {
    const catId = await seedCategory("食費");
    await db.insert(budgets).values([
      { categoryId: catId, month: "2026-06-01", amount: 30000 },
      { categoryId: catId, month: "2026-07-01", amount: 40000 },
    ]);
    const b = await getEffectiveBudget(db, catId, "2026-07-01");
    expect(b?.amount).toBe(40000);
    expect(b?.month).toBe("2026-07-01");
  });

  it("対象月に無ければ、それ以前で最新の月の行を返す（引き継ぎ）", async () => {
    const catId = await seedCategory("食費");
    await db.insert(budgets).values([
      { categoryId: catId, month: "2026-05-01", amount: 20000 },
      { categoryId: catId, month: "2026-06-01", amount: 30000 },
    ]);
    const b = await getEffectiveBudget(db, catId, "2026-09-01");
    expect(b?.amount).toBe(30000);
    expect(b?.month).toBe("2026-06-01");
  });

  it("未来月の行は拾わない", async () => {
    const catId = await seedCategory("食費");
    await db.insert(budgets).values({ categoryId: catId, month: "2026-08-01", amount: 50000 });
    const b = await getEffectiveBudget(db, catId, "2026-07-01");
    expect(b).toBeUndefined();
  });

  it("設定が一度も無ければ undefined", async () => {
    const catId = await seedCategory("食費");
    const b = await getEffectiveBudget(db, catId, "2026-07-01");
    expect(b).toBeUndefined();
  });
});

describe("getEffectiveBudgets", () => {
  it("カテゴリ毎に最新の有効予算をMapで返す（明示行と引き継ぎの混在）", async () => {
    const food = await seedCategory("食費", 0);
    const daily = await seedCategory("日用品", 1);
    const hobby = await seedCategory("趣味", 2);
    await db.insert(budgets).values([
      { categoryId: food, month: "2026-07-01", amount: 40000 }, // 明示
      { categoryId: daily, month: "2026-05-01", amount: 5000 }, // 引き継ぎ
      { categoryId: daily, month: "2026-04-01", amount: 4000 }, // 古い方は使わない
      { categoryId: hobby, month: "2026-08-01", amount: 9999 }, // 未来 → 対象外
    ]);
    const map = await getEffectiveBudgets(db, "2026-07-01");
    expect(map.get(food)?.amount).toBe(40000);
    expect(map.get(daily)?.amount).toBe(5000);
    expect(map.get(daily)?.month).toBe("2026-05-01");
    expect(map.has(hobby)).toBe(false);
  });

  it("予算が無ければ空のMap", async () => {
    await seedCategory("食費");
    const map = await getEffectiveBudgets(db, "2026-07-01");
    expect(map.size).toBe(0);
  });
});
