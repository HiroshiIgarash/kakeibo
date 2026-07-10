import { and, desc, eq, lte } from "drizzle-orm";
import type { Db, DbTransaction } from "@/db/schema";
import { budgets } from "@/db/schema";

/**
 * 有効予算: 対象月に明示行が無ければ、それ以前で最新の月の行を引き継いで使う（spec:
 * docs/superpowers/specs/2026-07-10-budget-carryover-design.md）。
 * 「一度設定した予算は変更されるまで有効」を読み取り側で実現する。
 */
export type EffectiveBudget = {
  budgetId: number;
  categoryId: number;
  amount: number;
  month: string; // 引き継ぎ元の月キー 'YYYY-MM-01'
};

type Executor = Db | DbTransaction;

/** 単一カテゴリの有効予算（無ければ undefined） */
export async function getEffectiveBudget(
  db: Executor,
  categoryId: number,
  monthKey: string,
): Promise<EffectiveBudget | undefined> {
  const row = (
    await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.categoryId, categoryId), lte(budgets.month, monthKey)))
      .orderBy(desc(budgets.month))
      .limit(1)
  )[0];
  if (!row) return undefined;
  return { budgetId: row.id, categoryId: row.categoryId, amount: row.amount, month: row.month };
}

/** 全カテゴリの有効予算（categoryId → EffectiveBudget）。予算の無いカテゴリはキー自体が無い */
export async function getEffectiveBudgets(
  db: Executor,
  monthKey: string,
): Promise<Map<number, EffectiveBudget>> {
  // 対象月以前の全行を月昇順で取得し、カテゴリ毎に最後（=最新月）の行で上書きして縮約する。
  // データ量はカテゴリ数×設定変更回数で極小のため、DISTINCT ON等よりJS縮約の単純さを優先。
  const rows = await db
    .select()
    .from(budgets)
    .where(lte(budgets.month, monthKey))
    .orderBy(budgets.month);
  const map = new Map<number, EffectiveBudget>();
  for (const row of rows) {
    map.set(row.categoryId, {
      budgetId: row.id,
      categoryId: row.categoryId,
      amount: row.amount,
      month: row.month,
    });
  }
  return map;
}
