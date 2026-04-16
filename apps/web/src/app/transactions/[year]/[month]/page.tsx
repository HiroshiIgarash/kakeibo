import { query } from "@/lib/apollo-client";
import { gql } from "@apollo/client";
import { redirect } from "next/navigation";
import { MonthNavigator } from "@/components/month-navigator";
import { TransactionsView } from "@/components/transactions-view";
import { BudgetList } from "@/components/budget-list";
import { SummaryCard } from "@/components/summary-card";
import type { TransactionsPageQuery } from "@/gql/graphql";

const TRANSACTIONS_PAGE_QUERY = gql`
  query TransactionsPage($year: Int!, $month: Int!) {
    transactions(year: $year, month: $month, first: 500) {
      nodes {
        id
        amount
        storeName
        purchasedAt
        memo
        category {
          id
          name
          color
        }
      }
    }
    monthlySummary(year: $year, month: $month) {
      totalAmount
      budgetAmount
      remainingAmount
      categoryBreakdowns {
        categoryId
        categoryName
        amount
        paceStatus
        budgetAmount
        remainingAmount
        dailyAmount
      }
    }
  }
`;

type Transaction = NonNullable<
  NonNullable<TransactionsPageQuery["transactions"]["nodes"]>[number]
>;

export default async function TransactionsPage(
  props: PageProps<"/transactions/[year]/[month]">
) {
  const { year: yearStr, month: monthStr } = await props.params;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const isFuture =
    year > currentYear || (year === currentYear && month > currentMonth);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12 || isFuture) {
    redirect(`/transactions/${currentYear}/${currentMonth}`);
  }

  const { data } = await query<TransactionsPageQuery>({
    query: TRANSACTIONS_PAGE_QUERY,
    variables: { year, month },
  });

  if (!data) throw new Error("データの取得に失敗しました");

  const transactions = (data.transactions.nodes ?? []).filter(
    (t): t is Transaction => t !== null
  );

  const { monthlySummary } = data;

  // 今月なら今日の経過率、過去月は完了しているので100%
  const isCurrentMonth = year === currentYear && month === currentMonth;
  const daysInMonth = new Date(year, month, 0).getDate();
  const idealPacePercent = isCurrentMonth
    ? Math.round((now.getDate() / daysInMonth) * 100)
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
        />

        <BudgetList
          breakdowns={monthlySummary.categoryBreakdowns}
          idealPacePercent={idealPacePercent}
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
