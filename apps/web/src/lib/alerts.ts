import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { DbTransaction } from "../db/schema";
import {
  budgets,
  budgetAlerts,
  budgetAlertSettings,
  notifications,
  paceAlerts,
  paceAlertSettings,
  transactions,
  unclassifiedAlerts,
} from "../db/schema";
import { calcBudgetPace } from "./budget-pace";
import { jstDateParts, jstEndOfDay, jstMonthRange, jstToday, monthKey } from "./dates";

/** 取引 insert/update と同一 tx 内で、予算アラート(§5.3)とペースアラート(§5.4)を判定する。 */
export async function evaluateAlertsForTransaction(
  tx: DbTransaction,
  transactionId: number,
): Promise<void> {
  const transaction = (
    await tx.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1)
  )[0];
  if (!transaction) return;

  const categoryId = transaction.categoryId;
  if (categoryId == null) return; // 未分類はアラート対象外

  await evaluateBudgetAlert(tx, categoryId, transaction.purchasedAt);
  await evaluatePaceAlert(tx, categoryId);
}

async function evaluateBudgetAlert(
  tx: DbTransaction,
  categoryId: number,
  purchasedAt: Date,
): Promise<void> {
  const { year, month } = jstDateParts(purchasedAt);
  const mKey = monthKey(year, month);

  const budget = (
    await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.categoryId, categoryId), eq(budgets.month, mKey)))
      .limit(1)
  )[0];
  if (!budget) return;

  const setting = (
    await tx
      .select()
      .from(budgetAlertSettings)
      .where(eq(budgetAlertSettings.categoryId, categoryId))
      .limit(1)
  )[0];
  if (!setting || !setting.isActive) return;

  const { start, end } = jstMonthRange(year, month);
  const spentRow = await tx
    .select({ spent: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.categoryId, categoryId),
        gte(transactions.purchasedAt, start),
        lte(transactions.purchasedAt, end),
      ),
    );
  const spent = Number(spentRow[0].spent);
  const usageRate = Math.round((spent / budget.amount) * 100 * 10) / 10;

  const thresholds = [setting.threshold, setting.threshold2].filter(
    (t): t is number => t != null,
  );

  for (const threshold of thresholds) {
    if (usageRate < threshold) continue;

    const existing = (
      await tx
        .select()
        .from(budgetAlerts)
        .where(
          and(
            eq(budgetAlerts.categoryId, categoryId),
            eq(budgetAlerts.month, mKey),
            eq(budgetAlerts.threshold, threshold),
          ),
        )
        .limit(1)
    )[0];
    if (existing) continue; // 同一閾値の重複送信を防ぐ

    const [inserted] = await tx
      .insert(budgetAlerts)
      .values({
        categoryId,
        month: mKey,
        threshold,
        usagePercent: Math.trunc(usageRate),
      })
      .returning({ id: budgetAlerts.id });
    await tx
      .insert(notifications)
      .values({ notifiableType: "BudgetAlert", notifiableId: inserted.id });
  }
}

async function evaluatePaceAlert(tx: DbTransaction, categoryId: number): Promise<void> {
  const setting = (
    await tx
      .select()
      .from(paceAlertSettings)
      .where(eq(paceAlertSettings.categoryId, categoryId))
      .limit(1)
  )[0];
  if (!setting || !setting.isActive) return;

  const today = jstToday();
  const { year, month, day } = jstDateParts(today);
  if (setting.activeFromDay > day) return; // 月初のデータ不足による誤判定を防ぐ

  const mKey = monthKey(year, month);
  const budget = (
    await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.categoryId, categoryId), eq(budgets.month, mKey)))
      .limit(1)
  )[0];
  if (!budget) return;

  const { start } = jstMonthRange(year, month);
  const spentRow = await tx
    .select({ spent: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.categoryId, categoryId),
        gte(transactions.purchasedAt, start),
        lte(transactions.purchasedAt, jstEndOfDay(today)),
      ),
    );
  const spent = Number(spentRow[0].spent);

  const result = calcBudgetPace({ budgetAmount: budget.amount, spentAmount: spent, date: today });

  const lastAlert = (
    await tx
      .select()
      .from(paceAlerts)
      .where(and(eq(paceAlerts.categoryId, categoryId), eq(paceAlerts.month, mKey)))
      .orderBy(desc(paceAlerts.triggeredAt))
      .limit(1)
  )[0];

  const paceRatePercent = result.paceRate * 100;

  if (paceRatePercent >= setting.threshold) {
    // RED 継続中（直近アラートが未回復）は再送しない
    if (lastAlert && lastAlert.recoveredAt == null) return;

    const [inserted] = await tx
      .insert(paceAlerts)
      .values({ categoryId, month: mKey, triggeredAt: new Date() })
      .returning({ id: paceAlerts.id });
    await tx
      .insert(notifications)
      .values({ notifiableType: "PaceAlert", notifiableId: inserted.id });
  } else {
    // 閾値未満（回復方向）: 未回復の直近アラートに recovered_at をセット
    if (lastAlert && lastAlert.recoveredAt == null) {
      await tx
        .update(paceAlerts)
        .set({ recoveredAt: new Date() })
        .where(eq(paceAlerts.id, lastAlert.id));
    }
  }
}

/** 未分類取引件数に応じて UnclassifiedAlert と通知を同期する(§5.6)。取引の再分類経路でも呼ぶ。 */
export async function refreshUnclassifiedAlert(tx: DbTransaction): Promise<void> {
  const countRow = await tx
    .select({ c: sql<string>`count(*)` })
    .from(transactions)
    .where(isNull(transactions.categoryId));
  const count = Number(countRow[0].c);

  const existing = (await tx.select().from(unclassifiedAlerts).limit(1))[0];

  if (count === 0) {
    if (existing) {
      // notifications は FK を持たないためポリモーフィック参照を明示的に削除する
      await tx
        .delete(notifications)
        .where(
          and(
            eq(notifications.notifiableType, "UnclassifiedAlert"),
            eq(notifications.notifiableId, existing.id),
          ),
        );
      await tx.delete(unclassifiedAlerts).where(eq(unclassifiedAlerts.id, existing.id));
    }
    return;
  }

  if (existing) {
    await tx
      .update(unclassifiedAlerts)
      .set({ count })
      .where(eq(unclassifiedAlerts.id, existing.id));
    const notif = (
      await tx
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.notifiableType, "UnclassifiedAlert"),
            eq(notifications.notifiableId, existing.id),
          ),
        )
        .limit(1)
    )[0];
    if (!notif) {
      await tx
        .insert(notifications)
        .values({ notifiableType: "UnclassifiedAlert", notifiableId: existing.id });
    }
  } else {
    const [inserted] = await tx
      .insert(unclassifiedAlerts)
      .values({ count })
      .returning({ id: unclassifiedAlerts.id });
    await tx
      .insert(notifications)
      .values({ notifiableType: "UnclassifiedAlert", notifiableId: inserted.id });
  }
}
