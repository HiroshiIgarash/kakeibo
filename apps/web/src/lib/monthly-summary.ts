import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../db/schema";
import { categories, transactions } from "../db/schema";
import { calcBudgetPace, type PaceStatus } from "./budget-pace";
import { getAlertTargetCategoryIds } from "./category-tree";
import { jstDateParts, jstEndOfDay, jstMonthRange, jstToday, monthKey } from "./dates";
import { getEffectiveBudgets } from "./effective-budget";

export type CategoryChildBreakdown = {
  categoryId: number;
  categoryName: string;
  amount: number;
};

export type CategoryBreakdown = {
  categoryId: number;
  categoryName: string;
  amount: number;
  percentage: number;
  paceStatus: PaceStatus | null;
  budgetAmount: number | null;
  remainingAmount: number | null;
  dailyAmount: number | null;
  children: CategoryChildBreakdown[];
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

  // 有効予算（対象月に明示行が無ければ直近月の設定を引き継ぐ）
  const effectiveBudgets = await getEffectiveBudgets(db, mKey);
  let budgetAmount = 0;
  for (const b of effectiveBudgets.values()) budgetAmount += b.amount;

  // カテゴリ別集計（category_id が null の取引は inner join で除外される）。
  // 子カテゴリの取引は親単位で集約するため、親情報を self-join で補完した子行のまま取得し、
  // JS 側で親id（子なら親id・親自身なら自id）に集約する。
  // 親子の合成（coalesce 相当）は SQL でなく JS で行う: 生SQL断片は drizzle の型マッパーを
  // 通らず、postgres-js が bigint を string で返す（pglite は number）ため、number キーの
  // 有効予算 Map と照合できず本番のみ budgetAmount が全 null になるバグの再発防止。
  const parentCategories = alias(categories, "parent_categories");
  const grouped = await db
    .select({
      childId: transactions.categoryId,
      childName: categories.name,
      parentIdRaw: categories.parentId,
      parentName: parentCategories.name,
      amount: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .where(and(gte(transactions.purchasedAt, start), lte(transactions.purchasedAt, end)))
    .groupBy(
      transactions.categoryId,
      categories.name,
      categories.parentId,
      categories.id,
      parentCategories.name,
    );

  type ParentAgg = {
    categoryId: number;
    categoryName: string;
    amount: number;
    children: CategoryChildBreakdown[];
  };
  const parentAggs = new Map<number, ParentAgg>();
  for (const row of grouped) {
    const amount = Number(row.amount);
    const isChild = row.parentIdRaw != null;
    const parentId = row.parentIdRaw ?? (row.childId as number);
    const parentName = row.parentName ?? row.childName;
    let agg = parentAggs.get(parentId);
    if (!agg) {
      agg = { categoryId: parentId, categoryName: parentName, amount: 0, children: [] };
      parentAggs.set(parentId, agg);
    }
    agg.amount += amount;
    // 親への直付け取引は親行の amount にのみ算入し、children には含めない
    if (isChild) {
      agg.children.push({ categoryId: row.childId as number, categoryName: row.childName, amount });
    }
  }
  for (const agg of parentAggs.values()) {
    agg.children.sort((a, b) => b.amount - a.amount);
  }

  // 過去月はペース計算が無意味なため pace_date = null（当月のみ当日を使う）
  const now = jstToday();
  const nowParts = jstDateParts(now);
  const paceDate = nowParts.year === year && nowParts.month === month ? now : null;

  const categoryBreakdowns: CategoryBreakdown[] = [];
  for (const agg of parentAggs.values()) {
    const { categoryId, categoryName, amount, children } = agg;
    const percentage = totalAmount === 0 ? 0 : Math.round((amount / totalAmount) * 100 * 10) / 10;

    let paceStatus: PaceStatus | null = null;
    let bAmount: number | null = null;
    let rAmount: number | null = null;
    let dAmount: number | null = null;

    const budget = effectiveBudgets.get(categoryId);
    if (budget) {
      // 予算情報はどの月でも返す（過去月の支出ページで進捗表示するため）。
      // ペース系（バッジ・日割り）は当月のみ意味を持つ。
      bAmount = budget.amount;
      rAmount = budget.amount - amount; // 月全体の実績に対する残額（マイナス可）
      if (paceDate) {
        // 親単位のペースは親+全子の取引合算で判定する
        const targetIds = await getAlertTargetCategoryIds(db, categoryId);
        const spentRow = await db
          .select({ spent: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
          .from(transactions)
          .where(
            and(
              inArray(transactions.categoryId, targetIds),
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
        rAmount = pace.remainingAmount; // 当月は従来どおり paceDate 基準
        dAmount = pace.dailyAmount;
      }
    }

    categoryBreakdowns.push({
      categoryId,
      categoryName,
      amount,
      percentage,
      paceStatus,
      budgetAmount: bAmount,
      remainingAmount: rAmount,
      dailyAmount: dAmount,
      children,
    });
  }

  return {
    totalAmount,
    budgetAmount,
    remainingAmount: budgetAmount - totalAmount,
    categoryBreakdowns,
  };
}
