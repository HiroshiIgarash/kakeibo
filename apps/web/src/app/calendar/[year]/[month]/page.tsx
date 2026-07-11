import { db } from "@/db/client";
import { loadTransactionsByMonth, loadMonthlySummaryView } from "@/lib/queries";
import { redirect } from "next/navigation";
import { jstToday, jstDateParts } from "@/lib/dates";
import { MonthNavigator } from "@/components/month-navigator";
import { CalendarPageContent } from "@/components/calendar-page-content";

// DB を参照する RSC のため、build 時の静的評価を避けて常にリクエスト時に描画する
export const dynamic = "force-dynamic";

export default async function CalendarPage(
  props: PageProps<"/calendar/[year]/[month]">
) {
  const { year: yearStr, month: monthStr } = await props.params;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const now = jstToday();
  const { year: currentYear, month: currentMonth } = jstDateParts(now);

  const isFuture =
    year > currentYear || (year === currentYear && month > currentMonth);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12 || isFuture) {
    redirect(`/calendar/${currentYear}/${currentMonth}`);
  }

  const [transactions, summary] = await Promise.all([
    loadTransactionsByMonth(db, year, month),
    loadMonthlySummaryView(db, year, month),
  ]);
  const budgetAmount = summary.budgetAmount;

  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
        <header>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            カレンダー
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">
            {year}年{month}月
          </h1>
        </header>

        <MonthNavigator year={year} month={month} basePath="calendar" />

        <CalendarPageContent
          key={`${year}-${month}`}
          transactions={transactions}
          year={year}
          month={month}
          budgetAmount={budgetAmount}
        />
      </div>
    </main>
  );
}
