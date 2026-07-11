import { db } from "@/db/client";
import { loadTransactionsByMonth, loadMonthlySummaryView } from "@/lib/queries";
import { redirect } from "next/navigation";
import { jstToday, jstDateParts, jstDaysInMonth, jstDayOfMonth } from "@/lib/dates";
import { MonthNavigator } from "@/components/month-navigator";
import { TransactionsView } from "@/components/transactions-view";
import { BudgetList } from "@/components/budget-list";
import { SummaryCard } from "@/components/summary-card";

// DB を参照する RSC のため、build 時の静的評価を避けて常にリクエスト時に描画する
export const dynamic = "force-dynamic";

export default async function TransactionsPage(
  props: PageProps<"/transactions/[year]/[month]">
) {
  const { year: yearStr, month: monthStr } = await props.params;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const now = jstToday();
  const { year: currentYear, month: currentMonth } = jstDateParts(now);

  const isFuture =
    year > currentYear || (year === currentYear && month > currentMonth);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12 || isFuture) {
    redirect(`/transactions/${currentYear}/${currentMonth}`);
  }

  const [transactions, monthlySummary] = await Promise.all([
    loadTransactionsByMonth(db, year, month),
    loadMonthlySummaryView(db, year, month),
  ]);

  // 今月なら今日の経過率、過去月は完了しているので100%
  const isCurrentMonth = year === currentYear && month === currentMonth;
  const daysInMonth = jstDaysInMonth(year, month);
  const idealPacePercent = isCurrentMonth
    ? Math.round((jstDayOfMonth(now) / daysInMonth) * 100)
    : 100;

  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
        <header>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            支出一覧
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">
            {year}年{month}月
          </h1>
        </header>

        <MonthNavigator year={year} month={month} />

        <SummaryCard
          totalAmount={monthlySummary.totalAmount}
          budgetAmount={monthlySummary.budgetAmount}
          remainingAmount={monthlySummary.remainingAmount}
          title={isCurrentMonth ? "今月の支出" : `${month}月の支出`}
        />

        <BudgetList
          breakdowns={monthlySummary.categoryBreakdowns}
          idealPacePercent={idealPacePercent}
          unclassifiedAmount={monthlySummary.unclassifiedAmount}
        />

        <div className="border-t border-border pt-2">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-4">
            支出明細
          </p>
          <TransactionsView
            key={`${year}-${month}`}
            transactions={transactions}
          />
        </div>
      </div>
    </main>
  );
}
