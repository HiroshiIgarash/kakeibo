import { db } from "@/db/client";
import {
  loadMonthlySummaryView,
  loadRecentTransactions,
  loadUnclassifiedGroups,
  loadCategoryOptions,
  loadParentCategoryOptions,
  loadFailedInboundEmails,
} from "@/lib/queries";
import { loadUnreadNotifications } from "@/lib/notifications";
import { jstToday, jstDateParts, jstDaysInMonth, jstDayOfMonth } from "@/lib/dates";
import { SummaryCard } from "@/components/summary-card";
import { BudgetList } from "@/components/budget-list";
import { RecentTransactions } from "@/components/recent-transactions";
import { NotificationList } from "@/components/notification-list";
import { UnclassifiedQuickClassify } from "@/components/unclassified-quick-classify";
import { FailedEmailResolve } from "@/components/failed-email-resolve";

// DB を参照する RSC のため、build 時の静的評価を避けて常にリクエスト時に描画する
export const dynamic = "force-dynamic";

export default async function Home() {
  const today = jstToday(); // 絶対時刻（実行環境TZに依存する生の Date）
  // year/month は必ず jstDateParts で取り出す。today.getFullYear()/getMonth() は
  // 実行環境TZ（Vercel=UTC）に引きずられるため使わない（Global Constraint 5, spec 移行H3）。
  const { year, month } = jstDateParts(today);

  const [
    monthlySummary,
    transactions,
    notifications,
    unclassifiedGroups,
    categoryOptions,
    parentCategoryOptions,
    failedEmails,
  ] = await Promise.all([
    loadMonthlySummaryView(db, year, month),
    loadRecentTransactions(db, 5),
    loadUnreadNotifications(db, 5),
    loadUnclassifiedGroups(db),
    loadCategoryOptions(db),
    loadParentCategoryOptions(db),
    loadFailedInboundEmails(db),
  ]);

  // 今月の経過率（理想ペースライン位置）。JST基準で算出する
  const daysInMonth = jstDaysInMonth(year, month);
  const idealPacePercent = Math.round((jstDayOfMonth(today) / daysInMonth) * 100);

  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
        <header>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            {year}年{month}月
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">かけいぼ</h1>
        </header>
        {notifications.length > 0 && <NotificationList notifications={notifications} />}
        <SummaryCard
          totalAmount={monthlySummary.totalAmount}
          budgetAmount={monthlySummary.budgetAmount}
          remainingAmount={monthlySummary.remainingAmount}
        />
        <UnclassifiedQuickClassify
          groups={unclassifiedGroups}
          categories={categoryOptions}
          parentOptions={parentCategoryOptions}
        />
        <FailedEmailResolve emails={failedEmails} />
        <BudgetList breakdowns={monthlySummary.categoryBreakdowns} idealPacePercent={idealPacePercent} unclassifiedAmount={monthlySummary.unclassifiedAmount} />
        <RecentTransactions transactions={transactions} />
      </div>
    </main>
  );
}
