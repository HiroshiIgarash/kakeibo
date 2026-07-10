import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db/schema";
import {
  transactions,
  categories,
  storeCategoryMappings,
  budgetAlertSettings,
  paceAlertSettings,
  inboundEmails,
} from "@/db/schema";
import { getEffectiveBudgets } from "@/lib/effective-budget";
import { extractSmbcFields } from "@/lib/email-parser";
import { getMonthlySummary } from "@/lib/monthly-summary";
import { jstMonthRange } from "@/lib/dates";
import { toJstDateString } from "@/lib/serialize";

export type CategoryRef = {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  parentName: string | null;
};
export type TransactionView = {
  id: string;
  amount: number;
  storeName: string;
  purchasedAt: string; // JST "YYYY-MM-DD"
  memo: string | null;
  category: CategoryRef | null;
};
export type CategoryView = {
  id: string;
  name: string;
  kind: "fixed" | "variable";
  color: string | null;
  parentId: string | null;
  sortOrder: number;
};
export type CategoryOption = {
  id: string;
  name: string;
  color: string | null;
  parentId: string;
  parentName: string;
};
export type ParentCategoryOption = { id: string; name: string; color: string | null };
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
    children: Array<{ categoryId: string; categoryName: string; amount: number }>;
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

// 親カテゴリを self-join するための alias（子の CategoryRef.color/parentName 補完に使う）
const parentCategories = alias(categories, "parent_categories");

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
      parentId: categories.parentId,
      parentName: parentCategories.name,
      parentColor: parentCategories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .where(where)
    .orderBy(desc(transactions.purchasedAt), desc(transactions.id));
  const rows = limit != null ? await q.limit(limit) : await q;
  return rows.map((r) => ({
    id: String(r.id),
    amount: r.amount,
    storeName: r.storeName,
    purchasedAt: toJstDateString(r.purchasedAt),
    memo: r.memo,
    category:
      r.catId == null
        ? null
        : {
            id: String(r.catId),
            name: r.catName!,
            color: r.parentColor ?? r.catColor,
            parentId: r.parentId == null ? null : String(r.parentId),
            parentName: r.parentName ?? null,
          },
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
      children: b.children.map((c) => ({
        categoryId: String(c.categoryId),
        categoryName: c.categoryName,
        amount: c.amount,
      })),
    })),
  };
}

export async function loadCategories(db: Db): Promise<CategoryView[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      kind: categories.kind,
      color: categories.color,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.id));
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    kind: r.kind,
    color: r.color,
    parentId: r.parentId == null ? null : String(r.parentId),
    sortOrder: r.sortOrder,
  }));
}

/** 子カテゴリのみ（分類先の選択肢は子のみ許可。色・名前は親から補完） */
export async function loadCategoryOptions(db: Db): Promise<CategoryOption[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      parentName: parentCategories.name,
      parentColor: parentCategories.color,
    })
    .from(categories)
    .innerJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .orderBy(
      asc(parentCategories.sortOrder),
      asc(parentCategories.id),
      asc(categories.sortOrder),
      asc(categories.id),
    );
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    color: r.parentColor,
    parentId: String(r.parentId),
    parentName: r.parentName,
  }));
}

/** 親カテゴリのみ（予算設定・カテゴリ管理画面の親選択用） */
export async function loadParentCategoryOptions(db: Db): Promise<ParentCategoryOption[]> {
  const rows = await db
    .select({ id: categories.id, name: categories.name, color: categories.color })
    .from(categories)
    .where(isNull(categories.parentId))
    .orderBy(asc(categories.sortOrder), asc(categories.id));
  return rows.map((r) => ({ id: String(r.id), name: r.name, color: r.color }));
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
      parentId: categories.parentId,
      parentName: parentCategories.name,
      parentColor: parentCategories.color,
    })
    .from(storeCategoryMappings)
    .innerJoin(categories, eq(storeCategoryMappings.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .orderBy(asc(storeCategoryMappings.storeName));
  return rows.map((r) => ({
    id: String(r.id),
    storeName: r.storeName,
    categoryId: String(r.categoryId),
    category: {
      id: String(r.catId),
      name: r.catName,
      color: r.parentColor ?? r.catColor,
      parentId: r.parentId == null ? null : String(r.parentId),
      parentName: r.parentName ?? null,
    },
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

export type BudgetSettingRow = {
  categoryId: string;
  categoryName: string;
  budgetId: string | null;
  amount: number | null;
  /** 対象月に明示行が無く、過去の設定を引き継いでいる場合の情報（fromMonth は 'YYYY-MM-01'） */
  inherited: { amount: number; fromMonth: string } | null;
};

export async function loadBudgetSettingsView(db: Db, monthKey: string): Promise<BudgetSettingRow[]> {
  const [rows, effective] = await Promise.all([
    db
      .select({ categoryId: categories.id, categoryName: categories.name })
      .from(categories)
      .where(isNull(categories.parentId))
      .orderBy(asc(categories.sortOrder), asc(categories.id)),
    getEffectiveBudgets(db, monthKey),
  ]);
  return rows.map((r) => {
    const b = effective.get(r.categoryId);
    // 有効予算の月が対象月と一致 = その月の明示行。それ以外は引き継ぎ
    const explicit = b != null && b.month === monthKey ? b : null;
    const inherited = b != null && b.month !== monthKey ? b : null;
    return {
      categoryId: String(r.categoryId),
      categoryName: r.categoryName,
      budgetId: explicit == null ? null : String(explicit.budgetId),
      amount: explicit?.amount ?? null,
      inherited: inherited == null ? null : { amount: inherited.amount, fromMonth: inherited.month },
    };
  });
}

export type UnclassifiedGroup = {
  storeName: string;
  count: number;
  totalAmount: number;
};

/** 未分類取引を店名でグルーピング（件数降順→店名昇順）。ホームのクイック分類用 */
export async function loadUnclassifiedGroups(db: Db): Promise<UnclassifiedGroup[]> {
  const rows = await db
    .select({
      storeName: transactions.storeName,
      count: sql<string>`count(*)`,
      totalAmount: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(isNull(transactions.categoryId))
    .groupBy(transactions.storeName)
    .orderBy(sql`count(*) desc`, asc(transactions.storeName));
  return rows.map((r) => ({
    storeName: r.storeName,
    count: Number(r.count),
    totalAmount: Number(r.totalAmount),
  }));
}

export type FailedInboundEmailView = {
  id: string;
  subject: string | null;
  errorMessage: string | null;
  receivedAt: string; // JST 'YYYY-MM-DD'
  storeName?: string;
  date?: string; // 抽出できた利用日 'YYYY-MM-DD'
  amountRaw?: string; // 元の金額表記（例: '990.00 JPY'）
};

/** 取り込み失敗メール（手動登録用）。created_at 降順、本文からプリフィルを部分抽出 */
export async function loadFailedInboundEmails(db: Db): Promise<FailedInboundEmailView[]> {
  const rows = await db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.status, "failed"))
    .orderBy(desc(inboundEmails.createdAt));
  return rows.map((r) => {
    const fields = extractSmbcFields(r.rawBody);
    return {
      id: String(r.id),
      subject: r.subject,
      errorMessage: r.errorMessage,
      receivedAt: toJstDateString(r.createdAt),
      ...fields,
    };
  });
}
