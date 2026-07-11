import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./db";
import { categories, transactions } from "../db/schema";

const { db, teardown } = await createTestDb();

afterAll(async () => {
  await teardown();
});

describe("schema smoke", () => {
  it("マイグレーション適用後にカテゴリと取引を insert できる", async () => {
    const [cat] = await db
      .insert(categories)
      .values({ name: "食費", kind: "variable" })
      .returning();
    expect(cat.id).toBeGreaterThan(0);

    const [tx] = await db
      .insert(transactions)
      .values({
        amount: 1000,
        storeName: "テスト店",
        purchasedAt: new Date("2026-07-08T07:22:00Z"),
        categoryId: cat.id,
        source: "email",
      })
      .returning();
    expect(tx.amount).toBe(1000);

    const found = await db.select().from(categories).where(eq(categories.id, cat.id));
    expect(found).toHaveLength(1);
  });
});
