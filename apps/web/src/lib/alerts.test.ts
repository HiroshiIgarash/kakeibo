import { describe, it, expect, afterAll, afterEach, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, resetTestDb } from "../test/db";
import {
  categories,
  budgets,
  transactions,
  budgetAlertSettings,
  budgetAlerts,
  paceAlertSettings,
  paceAlerts,
  unclassifiedAlerts,
  notifications,
} from "../db/schema";
import { evaluateAlertsForTransaction, refreshUnclassifiedAlert } from "./alerts";

const { db, client, teardown } = await createTestDb();

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await teardown();
});

// 固定「今日」: 2026-07-10（JST）
const setToday = () => vi.setSystemTime(new Date("2026-07-10T03:00:00+09:00"));
const MONTH_KEY = "2026-07-01";

async function makeCategory(name = "食費") {
  const [c] = await db.insert(categories).values({ name, kind: "variable" }).returning();
  return c;
}
async function makeChildCategory(parentId: number, name: string) {
  const [c] = await db
    .insert(categories)
    .values({ name, kind: "variable", parentId })
    .returning();
  return c;
}
async function insertTx(categoryId: number | null, amount: number) {
  const [t] = await db
    .insert(transactions)
    .values({
      amount,
      storeName: "s",
      purchasedAt: new Date("2026-07-10T03:00:00+09:00"),
      categoryId,
      source: "manual",
    })
    .returning();
  return t;
}
const evaluate = (id: number) => db.transaction((tx) => evaluateAlertsForTransaction(tx, id));

describe("evaluateAlertsForTransaction: 予算アラート", () => {
  beforeEach(async () => {
    setToday();
    await resetTestDb(client);
  });

  it("明示行が無い月でも直近月の予算を引き継いでアラート判定する", async () => {
    const c = await makeCategory();
    // 予算は5月にのみ設定 → 7月の取引は引き継ぎ予算(10,000円)で判定される
    await db.insert(budgets).values({ categoryId: c.id, month: "2026-05-01", amount: 10_000 });
    await db
      .insert(budgetAlertSettings)
      .values({ categoryId: c.id, threshold: 80, threshold2: null, isActive: true });
    const t = await insertTx(c.id, 8_500); // 85% >= 80
    await evaluate(t.id);
    const alerts = await db.select().from(budgetAlerts);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].month).toBe(MONTH_KEY); // アラートの月キーは取引の月のまま
  });

  it("使用率が閾値超過で BudgetAlert と Notification を1件ずつ作成", async () => {
    const c = await makeCategory();
    await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 10_000 });
    await db
      .insert(budgetAlertSettings)
      .values({ categoryId: c.id, threshold: 80, threshold2: null, isActive: true });
    const t = await insertTx(c.id, 8_500); // 85% >= 80

    await evaluate(t.id);

    const alerts = await db.select().from(budgetAlerts);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].threshold).toBe(80);
    expect(alerts[0].month).toBe(MONTH_KEY);
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.notifiableType, "BudgetAlert"));
    expect(notifs).toHaveLength(1);
    expect(notifs[0].notifiableId).toBe(alerts[0].id);
  });

  it("使用率が閾値未満なら作成しない", async () => {
    const c = await makeCategory();
    await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 10_000 });
    await db.insert(budgetAlertSettings).values({ categoryId: c.id, threshold: 80 });
    const t = await insertTx(c.id, 7_000); // 70% < 80
    await evaluate(t.id);
    expect(await db.select().from(budgetAlerts)).toHaveLength(0);
  });

  it("予算未設定なら作成しない", async () => {
    const c = await makeCategory();
    await db.insert(budgetAlertSettings).values({ categoryId: c.id, threshold: 80 });
    const t = await insertTx(c.id, 9_000);
    await evaluate(t.id);
    expect(await db.select().from(budgetAlerts)).toHaveLength(0);
  });

  it("設定が無効なら作成しない", async () => {
    const c = await makeCategory();
    await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 10_000 });
    await db.insert(budgetAlertSettings).values({ categoryId: c.id, threshold: 80, isActive: false });
    const t = await insertTx(c.id, 8_500);
    await evaluate(t.id);
    expect(await db.select().from(budgetAlerts)).toHaveLength(0);
  });

  it("同一閾値で既存アラートがあれば重複作成しない", async () => {
    const c = await makeCategory();
    await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 10_000 });
    await db.insert(budgetAlertSettings).values({ categoryId: c.id, threshold: 80 });
    await db
      .insert(budgetAlerts)
      .values({ categoryId: c.id, month: MONTH_KEY, threshold: 80, usagePercent: 85 });
    const t = await insertTx(c.id, 8_500);
    await evaluate(t.id);
    expect(await db.select().from(budgetAlerts)).toHaveLength(1);
  });

  it("threshold_2 も超過すれば2件作成する", async () => {
    const c = await makeCategory();
    await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 10_000 });
    await db
      .insert(budgetAlertSettings)
      .values({ categoryId: c.id, threshold: 80, threshold2: 100 });
    const t = await insertTx(c.id, 10_500); // 105% >= 80 and >= 100
    await evaluate(t.id);
    expect(await db.select().from(budgetAlerts)).toHaveLength(2);
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.notifiableType, "BudgetAlert"));
    expect(notifs).toHaveLength(2);
  });

  it("未分類取引ではアラート判定しない", async () => {
    const t = await insertTx(null, 9_999);
    await evaluate(t.id);
    expect(await db.select().from(budgetAlerts)).toHaveLength(0);
  });

  it("子カテゴリの取引で親の予算アラートが発火し、複数子の支出が合算される", async () => {
    const parent = await makeCategory("食費");
    const okashi = await makeChildCategory(parent.id, "お菓子");
    const gaishoku = await makeChildCategory(parent.id, "外出");
    await db.insert(budgets).values({ categoryId: parent.id, month: MONTH_KEY, amount: 10_000 });
    await db
      .insert(budgetAlertSettings)
      .values({ categoryId: parent.id, threshold: 80, threshold2: null, isActive: true });
    await insertTx(okashi.id, 5_000);
    const t2 = await insertTx(gaishoku.id, 4_000); // 5,000 + 4,000 = 9,000 (90%) >= 80

    await evaluate(t2.id);

    const alerts = await db.select().from(budgetAlerts);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].categoryId).toBe(parent.id); // 記録される categoryId は親ID
    expect(alerts[0].threshold).toBe(80);
  });
});

describe("evaluateAlertsForTransaction: ペースアラート", () => {
  beforeEach(async () => {
    setToday();
    await resetTestDb(client);
  });

  async function setup(paceOpts?: { activeFromDay?: number; isActive?: boolean }) {
    const c = await makeCategory();
    await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 30_000 });
    await db.insert(paceAlertSettings).values({
      categoryId: c.id,
      threshold: 110,
      activeFromDay: paceOpts?.activeFromDay ?? 5,
      isActive: paceOpts?.isActive ?? true,
    });
    return c;
  }

  it("閾値超過（初回）で PaceAlert と Notification を作成", async () => {
    const c = await setup();
    // 7/10: ideal=10/31≈0.323, spent15000/30000=0.5 → pace_rate≈1.55*100=155 >= 110
    const t = await insertTx(c.id, 15_000);
    await evaluate(t.id);
    const alerts = await db.select().from(paceAlerts);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].recoveredAt).toBeNull();
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.notifiableType, "PaceAlert"));
    expect(notifs).toHaveLength(1);
  });

  it("active_from_day より前は判定しない", async () => {
    vi.setSystemTime(new Date("2026-07-03T03:00:00+09:00")); // day 3 < 5
    const c = await setup({ activeFromDay: 5 });
    const t = await insertTx(c.id, 15_000);
    await evaluate(t.id);
    expect(await db.select().from(paceAlerts)).toHaveLength(0);
  });

  it("閾値未満なら作成しない", async () => {
    const c = await setup();
    const t = await insertTx(c.id, 3_000); // pace_rate 低い
    await evaluate(t.id);
    expect(await db.select().from(paceAlerts)).toHaveLength(0);
  });

  it("RED 継続中（未回復）なら重複作成しない", async () => {
    const c = await setup();
    await db.insert(paceAlerts).values({
      categoryId: c.id,
      month: MONTH_KEY,
      triggeredAt: new Date("2026-07-09T03:00:00+09:00"),
      recoveredAt: null,
    });
    const t = await insertTx(c.id, 15_000);
    await evaluate(t.id);
    expect(await db.select().from(paceAlerts)).toHaveLength(1);
  });

  it("回復済みの後に再度 RED なら新規作成", async () => {
    const c = await setup();
    await db.insert(paceAlerts).values({
      categoryId: c.id,
      month: MONTH_KEY,
      triggeredAt: new Date("2026-07-08T03:00:00+09:00"),
      recoveredAt: new Date("2026-07-09T03:00:00+09:00"),
    });
    const t = await insertTx(c.id, 15_000);
    await evaluate(t.id);
    expect(await db.select().from(paceAlerts)).toHaveLength(2);
  });

  it("閾値未満に回復したら最新アラートの recovered_at をセット", async () => {
    const c = await setup();
    const [alert] = await db
      .insert(paceAlerts)
      .values({
        categoryId: c.id,
        month: MONTH_KEY,
        triggeredAt: new Date("2026-07-05T03:00:00+09:00"),
        recoveredAt: null,
      })
      .returning();
    const t = await insertTx(c.id, 3_000); // 閾値未満
    await evaluate(t.id);
    const updated = (
      await db.select().from(paceAlerts).where(eq(paceAlerts.id, alert.id))
    )[0];
    expect(updated.recoveredAt).not.toBeNull();
  });

  it("子カテゴリの取引で親のペースアラートが発火する", async () => {
    const parent = await setup(); // 親にペース設定・予算あり
    const child = await makeChildCategory(parent.id, "外出");
    // 7/10: ideal=10/31≈0.323, spent15000/30000=0.5 → pace_rate≈155 >= 110
    const t = await insertTx(child.id, 15_000);
    await evaluate(t.id);
    const alerts = await db.select().from(paceAlerts);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].categoryId).toBe(parent.id); // 記録される categoryId は親ID
  });
});

describe("refreshUnclassifiedAlert", () => {
  beforeEach(async () => {
    setToday();
    await resetTestDb(client);
  });
  const refresh = () => db.transaction((tx) => refreshUnclassifiedAlert(tx));

  it("未分類が0件・既存アラートありなら削除（通知も削除）", async () => {
    const [a] = await db.insert(unclassifiedAlerts).values({ count: 3 }).returning();
    await db
      .insert(notifications)
      .values({ notifiableType: "UnclassifiedAlert", notifiableId: a.id });
    await refresh();
    expect(await db.select().from(unclassifiedAlerts)).toHaveLength(0);
    expect(
      await db
        .select()
        .from(notifications)
        .where(eq(notifications.notifiableType, "UnclassifiedAlert")),
    ).toHaveLength(0);
  });

  it("未分類が0件・アラートなしなら何もしない", async () => {
    await refresh();
    expect(await db.select().from(unclassifiedAlerts)).toHaveLength(0);
  });

  it("未分類ありで初回は作成（count と通知）", async () => {
    await insertTx(null, 100);
    await refresh();
    const alerts = await db.select().from(unclassifiedAlerts);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].count).toBe(1);
    expect(
      await db
        .select()
        .from(notifications)
        .where(eq(notifications.notifiableType, "UnclassifiedAlert")),
    ).toHaveLength(1);
  });

  it("既存ありなら count 更新のみ・通知は増やさない", async () => {
    const [a] = await db.insert(unclassifiedAlerts).values({ count: 1 }).returning();
    await db
      .insert(notifications)
      .values({ notifiableType: "UnclassifiedAlert", notifiableId: a.id });
    await insertTx(null, 100);
    await insertTx(null, 200);
    await refresh();
    const updated = (await db.select().from(unclassifiedAlerts))[0];
    expect(updated.count).toBe(2);
    expect(
      await db
        .select()
        .from(notifications)
        .where(eq(notifications.notifiableType, "UnclassifiedAlert")),
    ).toHaveLength(1);
  });
});
