import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createTestDb, resetTestDb } from "@/test/db";
import { categories, budgetAlerts, unclassifiedAlerts, inboundEmails, notifications } from "@/db/schema";
import { loadUnreadNotifications } from "./notifications";

const { db, client, teardown } = await createTestDb();

beforeEach(async () => {
  await resetTestDb(client);
});

afterAll(async () => {
  await teardown();
});

describe("loadUnreadNotifications", () => {
  it("未読のみを created_at 降順で、notifiable を合成して返す", async () => {
    const [cat] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    const [ba] = await db
      .insert(budgetAlerts)
      .values({ categoryId: cat.id, month: "2026-07-01", threshold: 80, usagePercent: 85 })
      .returning();
    const [ua] = await db.insert(unclassifiedAlerts).values({ count: 3 }).returning();
    const [ie] = await db
      .insert(inboundEmails)
      .values({
        messageId: "m1",
        from: "x@vpass.ne.jp",
        subject: "件名",
        rawBody: "body",
        status: "failed",
        errorMessage: "金額抽出失敗",
      })
      .returning();
    await db.insert(notifications).values([
      { notifiableType: "BudgetAlert", notifiableId: ba.id },
      { notifiableType: "UnclassifiedAlert", notifiableId: ua.id },
      { notifiableType: "InboundEmail", notifiableId: ie.id },
    ]);

    const rows = await loadUnreadNotifications(db, 5);

    expect(rows).toHaveLength(3);
    const byType = Object.fromEntries(rows.map((r) => [r.notifiable.__typename, r.notifiable]));
    expect(byType.BudgetAlert).toMatchObject({ threshold: 80, usagePercent: 85, category: { name: "食費" } });
    expect(byType.UnclassifiedAlert).toMatchObject({ count: 3 });
    expect(byType.InboundEmail).toMatchObject({ subject: "件名", errorMessage: "金額抽出失敗" });
    expect(typeof rows[0].id).toBe("string");
  });

  it("既読(readAt 非null)は除外する", async () => {
    const [ua] = await db.insert(unclassifiedAlerts).values({ count: 1 }).returning();
    await db.insert(notifications).values({ notifiableType: "UnclassifiedAlert", notifiableId: ua.id, readAt: new Date() });

    expect(await loadUnreadNotifications(db, 5)).toHaveLength(0);
  });

  it("対応する notifiable レコードが消えている(orphan)通知は除外する", async () => {
    await db.insert(notifications).values({ notifiableType: "BudgetAlert", notifiableId: 999999 });

    expect(await loadUnreadNotifications(db, 5)).toHaveLength(0);
  });

  it("limit 件数で打ち切る", async () => {
    const [ua1] = await db.insert(unclassifiedAlerts).values({ count: 1 }).returning();
    const [ua2] = await db.insert(unclassifiedAlerts).values({ count: 2 }).returning();
    await db.insert(notifications).values([
      { notifiableType: "UnclassifiedAlert", notifiableId: ua1.id },
      { notifiableType: "UnclassifiedAlert", notifiableId: ua2.id },
    ]);

    expect(await loadUnreadNotifications(db, 1)).toHaveLength(1);
  });
});
