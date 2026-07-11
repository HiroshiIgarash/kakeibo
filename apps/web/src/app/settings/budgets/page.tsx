import { db } from "@/db/client";
import { loadBudgetSettingsView } from "@/lib/queries";
import { BudgetSettingsContent } from "@/components/budget-settings-content";
import { monthKey } from "@/lib/dates";
import { resolveMonthParam, monthParam } from "@/lib/month-param";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

// DB を参照する RSC のため、build 時の静的評価を避けて常にリクエスト時に描画する
export const dynamic = "force-dynamic";

export default async function BudgetSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthQuery } = await searchParams;
  const { year, month } = resolveMonthParam(monthQuery);
  const mKey = monthKey(year, month);

  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  const rows = await loadBudgetSettingsView(db, mKey);

  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
        <header>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3 -ml-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            設定に戻る
          </Link>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Settings
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">予算設定</h1>
        </header>

        <BudgetSettingsContent
          rows={rows}
          month={mKey}
          monthLabel={`${year}年${month}月`}
          prevHref={`/settings/budgets?month=${monthParam(prev.year, prev.month)}`}
          nextHref={`/settings/budgets?month=${monthParam(next.year, next.month)}`}
        />
      </div>
    </main>
  );
}
