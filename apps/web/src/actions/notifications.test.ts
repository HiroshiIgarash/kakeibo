import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createTestDb } from "@/test/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// db シングルトンをテストDBへ差し替える。createTestDb() は { db, client, teardown } を返す
// （計画A提供の戻り値シェイプ）ので db だけを testDb として使う。
const { db: testDb, teardown } = await createTestDb();
vi.mock("@/db/client", () => ({ db: testDb }));

const { unclassifiedAlerts, notifications } = await import("@/db/schema");
const { markNotificationAsRead, markAllNotificationsAsRead } = await import("./notifications");
const { isNull } = await import("drizzle-orm");

afterAll(async () => {
  await teardown();
});

beforeEach(async () => {
  await testDb.delete(notifications);
  await testDb.delete(unclassifiedAlerts);
});

describe("markNotificationAsRead", () => {
  it("1件既読にする", async () => {
    const [ua] = await testDb.insert(unclassifiedAlerts).values({ count: 1 }).returning();
    const [n] = await testDb
      .insert(notifications)
      .values({ notifiableType: "UnclassifiedAlert", notifiableId: ua.id })
      .returning();
    expect((await markNotificationAsRead({ id: String(n.id) })).errors).toEqual([]);
    const rows = await testDb.select().from(notifications);
    expect(rows[0].readAt).not.toBeNull();
  });

  it("存在しないIDはエラーを返す", async () => {
    const res = await markNotificationAsRead({ id: "999999" });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("空文字IDはバリデーションエラー", async () => {
    const res = await markNotificationAsRead({ id: "" });
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

describe("markAllNotificationsAsRead", () => {
  it("全件既読にする", async () => {
    const [ua] = await testDb.insert(unclassifiedAlerts).values({ count: 1 }).returning();
    await testDb.insert(notifications).values([
      { notifiableType: "UnclassifiedAlert", notifiableId: ua.id },
      { notifiableType: "UnclassifiedAlert", notifiableId: ua.id },
    ]);
    expect((await markAllNotificationsAsRead()).errors).toEqual([]);
    expect(await testDb.select().from(notifications).where(isNull(notifications.readAt))).toHaveLength(0);
  });

  it("既読済みの通知には影響しない（読了時刻を上書きしない挙動の確認）", async () => {
    const [ua] = await testDb.insert(unclassifiedAlerts).values({ count: 1 }).returning();
    await testDb.insert(notifications).values({
      notifiableType: "UnclassifiedAlert",
      notifiableId: ua.id,
      readAt: new Date("2026-01-01T00:00:00Z"),
    });
    const res = await markAllNotificationsAsRead();
    expect(res.errors).toEqual([]);
    const rows = await testDb.select().from(notifications);
    expect(rows[0].readAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
