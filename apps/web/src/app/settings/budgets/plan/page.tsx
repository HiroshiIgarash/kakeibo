import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db/client";
import { loadBudgetSettingsView } from "@/lib/queries";
import { getMonthlySummary } from "@/lib/monthly-summary";
import { monthKey } from "@/lib/dates";
import { resolveMonthParam, monthParam } from "@/lib/month-param";
import { BudgetPlanWizard } from "@/components/budget-plan-wizard";

// DB を参照する RSC のため、build 時の静的評価を避けて常にリクエスト時に描画する
export const dynamic = "force-dynamic";

export default async function BudgetPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthQuery } = await searchParams;
  const { year, month } = resolveMonthParam(monthQuery);
  const mKey = monthKey(year, month);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

  const [rows, prevSummary] = await Promise.all([
    loadBudgetSettingsView(db, mKey),
    getMonthlySummary(db, prev.year, prev.month),
  ]);

  // 先月の親カテゴリ別実績（breakdown の categoryId は number なので文字列化して引く）
  const prevSpentByCategory = new Map(
    prevSummary.categoryBreakdowns.map((b) => [String(b.categoryId), b.amount]),
  );

  const planCategories = rows.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    // 明示・引き継ぎを問わず現在の有効予算をプリフィル
    currentAmount: r.amount ?? r.inherited?.amount ?? null,
    lastMonthSpent: prevSpentByCategory.get(r.categoryId) ?? 0,
  }));
  const currentTotalBudget = planCategories.reduce((acc, c) => acc + (c.currentAmount ?? 0), 0);
  const backHref = `/settings/budgets?month=${monthParam(year, month)}`;

  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
        <header>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3 -ml-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            予算設定に戻る
          </Link>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Settings
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">
            {year}年{month}月の予算を調整
          </h1>
        </header>

        <BudgetPlanWizard
          month={mKey}
          backHref={backHref}
          prevMonthLabel={`${prev.year}年${prev.month}月`}
          lastMonthTotalSpent={prevSummary.totalAmount}
          lastMonthTotalBudget={prevSummary.budgetAmount}
          currentTotalBudget={currentTotalBudget}
          categories={planCategories}
        />
      </div>
    </main>
  );
}
