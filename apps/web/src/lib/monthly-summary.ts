import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "../db/schema";
import { budgets, categories, transactions } from "../db/schema";
import { calcBudgetPace, type PaceStatus } from "./budget-pace";
import { jstDateParts, jstEndOfDay, jstMonthRange, jstToday, monthKey } from "./dates";

export type CategoryBreakdown = {
  categoryId: number;
  categoryName: string;
  amount: number;
  percentage: number;
  paceStatus: PaceStatus | null;
  budgetAmount: number | null;
  remainingAmount: number | null;
  dailyAmount: number | null;
};

export type MonthlySummary = {
  totalAmount: number;
  budgetAmount: number;
  remainingAmount: number;
  categoryBreakdowns: CategoryBreakdown[];
};

export async function getMonthlySummary(
  db: Db,
  year: number,
  month: number,
): Promise<MonthlySummary> {
  const { start, end } = jstMonthRange(year, month);
  const mKey = monthKey(year, month);

  const totalRow = await db
    .select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(and(gte(transactions.purchasedAt, start), lte(transactions.purchasedAt, end)));
  const totalAmount = Number(totalRow[0].total);

  const budgetRow = await db
    .select({ total: sql<string>`coalesce(sum(${budgets.amount}), 0)` })
    .from(budgets)
    .where(eq(budgets.month, mKey));
  const budgetAmount = Number(budgetRow[0].total);

  // カテゴリ別集計（category_id が null の取引は inner join で除外される）
  const grouped = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      amount: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.purchasedAt, start), lte(transactions.purchasedAt, end)))
    .groupBy(transactions.categoryId, categories.name);

  // 過去月はペース計算が無意味なため pace_date = null（当月のみ当日を使う）
  const now = jstToday();
  const nowParts = jstDateParts(now);
  const paceDate = nowParts.year === year && nowParts.month === month ? now : null;

  const categoryBreakdowns: CategoryBreakdown[] = [];
  for (const row of grouped) {
    const categoryId = row.categoryId as number;
    const amount = Number(row.amount);
    const percentage = totalAmount === 0 ? 0 : Math.round((amount / totalAmount) * 100 * 10) / 10;

    let paceStatus: PaceStatus | null = null;
    let bAmount: number | null = null;
    let rAmount: number | null = null;
    let dAmount: number | null = null;

    if (paceDate) {
      const budget = (
        await db
          .select()
          .from(budgets)
          .where(and(eq(budgets.categoryId, categoryId), eq(budgets.month, mKey)))
          .limit(1)
      )[0];
      if (budget) {
        const spentRow = await db
          .select({ spent: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
          .from(transactions)
          .where(
            and(
              eq(transactions.categoryId, categoryId),
              gte(transactions.purchasedAt, start),
              lte(transactions.purchasedAt, jstEndOfDay(paceDate)),
            ),
          );
        const spent = Number(spentRow[0].spent);
        const pace = calcBudgetPace({
          budgetAmount: budget.amount,
          spentAmount: spent,
          date: paceDate,
        });
        paceStatus = pace.paceStatus;
        bAmount = budget.amount;
        rAmount = pace.remainingAmount;
        dAmount = pace.dailyAmount;
      }
    }

    categoryBreakdowns.push({
      categoryId,
      categoryName: row.categoryName,
      amount,
      percentage,
      paceStatus,
      budgetAmount: bAmount,
      remainingAmount: rAmount,
      dailyAmount: dAmount,
    });
  }

  return {
    totalAmount,
    budgetAmount,
    remainingAmount: budgetAmount - totalAmount,
    categoryBreakdowns,
  };
}
