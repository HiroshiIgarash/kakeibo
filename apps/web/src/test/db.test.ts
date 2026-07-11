import { describe, it, expect, afterAll } from "vitest";
import { createTestDb, resetTestDb } from "./db";
import { categories, transactions } from "../db/schema";

const { db, client, teardown } = await createTestDb();

afterAll(async () => {
  await teardown();
});

describe("resetTestDb", () => {
  it("全テーブルを空にし、id採番も新規DBと同じ1から始まる", async () => {
    const [cat] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await db.insert(transactions).values({
      amount: 100,
      storeName: "A",
      purchasedAt: new Date(),
      source: "manual",
      categoryId: cat.id,
    });

    await resetTestDb(client);

    expect(await db.select().from(categories)).toHaveLength(0);
    expect(await db.select().from(transactions)).toHaveLength(0);

    // RESTART IDENTITY: 新規DBと同じく id=1 から
    const [cat2] = await db.insert(categories).values({ name: "趣味", kind: "variable" }).returning();
    expect(cat2.id).toBe(1);
  });

  it("外部キー参照があっても CASCADE で消せる（参照順に依存しない）", async () => {
    const [cat] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await db.insert(transactions).values({
      amount: 100,
      storeName: "A",
      purchasedAt: new Date(),
      source: "manual",
      categoryId: cat.id,
    });
    await expect(resetTestDb(client)).resolves.toBeUndefined();
    expect(await db.select().from(categories)).toHaveLength(0);
  });
});
