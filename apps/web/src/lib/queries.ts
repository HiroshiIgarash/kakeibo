import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@/db/schema";
import {
  transactions,
  categories,
  storeCategoryMappings,
  budgetAlertSettings,
  paceAlertSettings,
} from "@/db/schema";
import { getMonthlySummary } from "@/lib/monthly-summary";
import { jstMonthRange } from "@/lib/dates";
import { toJstDateString } from "@/lib/serialize";

export type CategoryRef = { id: string; name: string; color: string | null };
export type TransactionView = {
  id: string;
  amount: number;
  storeName: string;
  purchasedAt: string; // JST "YYYY-MM-DD"
  memo: string | null;
  category: CategoryRef | null;
};
export type CategoryView = { id: string; name: string; kind: "fixed" | "variable"; color: string | null };
export type CategoryOption = { id: string; name: string; color: string | null };
export type StoreMappingView = {
  id: string;
  storeName: string;
  categoryId: string;
  category: CategoryRef;
};
export type MonthlySummaryView = {
  totalAmount: number;
  budgetAmount: number;
  remainingAmount: number;
  categoryBreakdowns: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    paceStatus: "GREEN" | "YELLOW" | "RED" | null;
    budgetAmount: number | null;
    remainingAmount: number | null;
    dailyAmount: number | null;
  }>;
};
export type AlertSettingsView = {
  budgetAlertSettings: Array<{
    id: string;
    categoryId: string | null;
    threshold: number;
    threshold2: number | null;
    isActive: boolean;
    category: { id: string; name: string } | null;
  }>;
  paceAlertSettings: Array<{
    id: string;
    categoryId: string;
    threshold: number;
    activeFromDay: number;
    isActive: boolean;
    category: { id: string; name: string };
  }>;
};

// 取引行を category 同梱の TransactionView へ整形する共通クエリ
async function selectTransactions(
  db: Db,
  where: ReturnType<typeof and> | undefined,
  limit?: number,
): Promise<TransactionView[]> {
  const q = db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      storeName: transactions.storeName,
      purchasedAt: transactions.purchasedAt,
      memo: transactions.memo,
      catId: categories.id,
      catName: categories.name,
      catColor: categories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(where)
    .orderBy(desc(transactions.purchasedAt), desc(transactions.id));
  const rows = limit != null ? await q.limit(limit) : await q;
  return rows.map((r) => ({
    id: String(r.id),
    amount: r.amount,
    storeName: r.storeName,
    purchasedAt: toJstDateString(r.purchasedAt),
    memo: r.memo,
    category: r.catId == null ? null : { id: String(r.catId), name: r.catName!, color: r.catColor },
  }));
}

export async function loadRecentTransactions(db: Db, limit: number): Promise<TransactionView[]> {
  return selectTransactions(db, undefined, limit);
}

export async function loadTransactionsByMonth(
  db: Db,
  year: number,
  month: number,
): Promise<TransactionView[]> {
  const { start, end } = jstMonthRange(year, month);
  return selectTransactions(
    db,
    and(gte(transactions.purchasedAt, start), lte(transactions.purchasedAt, end)),
  );
}

export async function loadMonthlySummaryView(
  db: Db,
  year: number,
  month: number,
): Promise<MonthlySummaryView> {
  const s = await getMonthlySummary(db, year, month);
  return {
    totalAmount: s.totalAmount,
    budgetAmount: s.budgetAmount,
    remainingAmount: s.remainingAmount,
    categoryBreakdowns: s.categoryBreakdowns.map((b) => ({
      categoryId: String(b.categoryId),
      categoryName: b.categoryName,
      amount: b.amount,
      paceStatus: b.paceStatus ?? null,
      budgetAmount: b.budgetAmount ?? null,
      remainingAmount: b.remainingAmount ?? null,
      dailyAmount: b.dailyAmount ?? null,
    })),
  };
}

export async function loadCategories(db: Db): Promise<CategoryView[]> {
  const rows = await db
    .select({ id: categories.id, name: categories.name, kind: categories.kind, color: categories.color })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.id));
  return rows.map((r) => ({ id: String(r.id), name: r.name, kind: r.kind, color: r.color }));
}

export async function loadCategoryOptions(db: Db): Promise<CategoryOption[]> {
  const rows = await loadCategories(db);
  return rows.map((c) => ({ id: c.id, name: c.name, color: c.color }));
}

export async function loadStoreMappings(db: Db): Promise<StoreMappingView[]> {
  const rows = await db
    .select({
      id: storeCategoryMappings.id,
      storeName: storeCategoryMappings.storeName,
      categoryId: storeCategoryMappings.categoryId,
      catId: categories.id,
      catName: categories.name,
      catColor: categories.color,
    })
    .from(storeCategoryMappings)
    .innerJoin(categories, eq(storeCategoryMappings.categoryId, categories.id))
    .orderBy(asc(storeCategoryMappings.storeName));
  return rows.map((r) => ({
    id: String(r.id),
    storeName: r.storeName,
    categoryId: String(r.categoryId),
    category: { id: String(r.catId), name: r.catName, color: r.catColor },
  }));
}

export async function loadAlertSettingsView(db: Db): Promise<AlertSettingsView> {
  const budgetRows = await db
    .select({
      id: budgetAlertSettings.id,
      categoryId: budgetAlertSettings.categoryId,
      threshold: budgetAlertSettings.threshold,
      threshold2: budgetAlertSettings.threshold2,
      isActive: budgetAlertSettings.isActive,
      catId: categories.id,
      catName: categories.name,
    })
    .from(budgetAlertSettings)
    .leftJoin(categories, eq(budgetAlertSettings.categoryId, categories.id));
  const paceRows = await db
    .select({
      id: paceAlertSettings.id,
      categoryId: paceAlertSettings.categoryId,
      threshold: paceAlertSettings.threshold,
      activeFromDay: paceAlertSettings.activeFromDay,
      isActive: paceAlertSettings.isActive,
      catId: categories.id,
      catName: categories.name,
    })
    .from(paceAlertSettings)
    .innerJoin(categories, eq(paceAlertSettings.categoryId, categories.id));
  return {
    budgetAlertSettings: budgetRows.map((r) => ({
      id: String(r.id),
      categoryId: r.categoryId == null ? null : String(r.categoryId),
      threshold: r.threshold,
      threshold2: r.threshold2,
      isActive: r.isActive,
      category: r.catId == null ? null : { id: String(r.catId), name: r.catName! },
    })),
    paceAlertSettings: paceRows.map((r) => ({
      id: String(r.id),
      categoryId: String(r.categoryId),
      threshold: r.threshold,
      activeFromDay: r.activeFromDay,
      isActive: r.isActive,
      category: { id: String(r.catId), name: r.catName },
    })),
  };
}
