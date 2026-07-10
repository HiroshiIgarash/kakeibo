import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { db: testDb, teardown } = await createTestDb();
vi.mock("@/db/client", () => ({ db: testDb }));

const { inboundEmails, transactions, notifications, categories, storeCategoryMappings, unclassifiedAlerts } =
  await import("@/db/schema");
const { resolveFailedInboundEmail, ignoreFailedInboundEmail } = await import("./inbound-emails");

afterAll(async () => {
  await teardown();
});

async function seedFailed(): Promise<number> {
  const [row] = await testDb
    .insert(inboundEmails)
    .values({
      messageId: `<f-${Math.random()}@x>`,
      from: "statement@vpass.ne.jp",
      subject: "ご利用のお知らせ",
      rawBody: "◇利用金額：990.00 JPY",
      status: "failed",
      errorMessage: "抽出失敗: 利用金額",
    })
    .returning();
  await testDb.insert(notifications).values({ notifiableType: "InboundEmail", notifiableId: row.id });
  return row.id;
}

beforeEach(async () => {
  await testDb.delete(notifications);
  await testDb.delete(unclassifiedAlerts);
  await testDb.delete(inboundEmails);
  await testDb.delete(transactions);
  await testDb.delete(storeCategoryMappings);
  await testDb.delete(categories);
});

describe("resolveFailedInboundEmail", () => {
  it("取引を作成して紐付け、processed化し、通知を消し、未分類アラートを更新する", async () => {
    const id = await seedFailed();
    const result = await resolveFailedInboundEmail({
      id: String(id),
      amount: 990,
      storeName: "GOOGLE*YOUTUBE MEMBER",
      date: "2026-06-09",
    });
    expect(result.errors).toEqual([]);

    const [ie] = await testDb.select().from(inboundEmails).where(eq(inboundEmails.id, id));
    expect(ie.status).toBe("processed");
    const [tx] = await testDb.select().from(transactions);
    expect(ie.transactionId).toBe(tx.id);
    expect(tx).toMatchObject({ amount: 990, storeName: "GOOGLE*YOUTUBE MEMBER", source: "email", categoryId: null });
    // InboundEmail通知は削除され、未分類アラートが立つ
    const notifs = await testDb.select().from(notifications);
    expect(notifs.filter((n) => n.notifiableType === "InboundEmail")).toHaveLength(0);
    const ua = await testDb.select().from(unclassifiedAlerts);
    expect(ua).toHaveLength(1);
    expect(ua[0].count).toBe(1);
  });

  it("マッピングが登録済みなら自動分類される", async () => {
    const [cat] = await testDb.insert(categories).values({ name: "娯楽", kind: "variable" }).returning();
    await testDb.insert(storeCategoryMappings).values({ storeName: "GOOGLE*YOUTUBE MEMBER", categoryId: cat.id });
    const id = await seedFailed();
    const result = await resolveFailedInboundEmail({
      id: String(id),
      amount: 990,
      storeName: "GOOGLE*YOUTUBE MEMBER",
      date: "2026-06-09",
    });
    expect(result.errors).toEqual([]);
    const [tx] = await testDb.select().from(transactions);
    expect(tx.categoryId).toBe(cat.id);
  });

  it("二重resolveは拒否される", async () => {
    const id = await seedFailed();
    await resolveFailedInboundEmail({ id: String(id), amount: 990, storeName: "X", date: "2026-06-09" });
    const again = await resolveFailedInboundEmail({ id: String(id), amount: 990, storeName: "X", date: "2026-06-09" });
    expect(again.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(transactions)).toHaveLength(1);
  });

  it("バリデーション: 金額0以下・店名空・日付不正を拒否", async () => {
    const id = await seedFailed();
    expect((await resolveFailedInboundEmail({ id: String(id), amount: 0, storeName: "X", date: "2026-06-09" })).errors.length).toBeGreaterThan(0);
    expect((await resolveFailedInboundEmail({ id: String(id), amount: 990, storeName: "", date: "2026-06-09" })).errors.length).toBeGreaterThan(0);
    expect((await resolveFailedInboundEmail({ id: String(id), amount: 990, storeName: "X", date: "06/09" })).errors.length).toBeGreaterThan(0);
  });
});

describe("ignoreFailedInboundEmail", () => {
  it("skipped化して通知を削除する（行は残る）", async () => {
    const id = await seedFailed();
    const result = await ignoreFailedInboundEmail({ id: String(id) });
    expect(result.errors).toEqual([]);
    const [ie] = await testDb.select().from(inboundEmails).where(eq(inboundEmails.id, id));
    expect(ie.status).toBe("skipped");
    expect(await testDb.select().from(notifications)).toHaveLength(0);
    expect(await testDb.select().from(transactions)).toHaveLength(0);
  });

  it("failed以外は拒否", async () => {
    const id = await seedFailed();
    await ignoreFailedInboundEmail({ id: String(id) });
    const again = await ignoreFailedInboundEmail({ id: String(id) });
    expect(again.errors.length).toBeGreaterThan(0);
  });
});
