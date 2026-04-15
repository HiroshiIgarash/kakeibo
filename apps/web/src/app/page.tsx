import { query } from "@/lib/apollo-client";
import { gql } from "@apollo/client";
import type { HomePageDataQuery } from "@/gql/graphql";
import { SummaryCard } from "@/components/summary-card";
import { BudgetList } from "@/components/budget-list";
import { RecentTransactions } from "@/components/recent-transactions";
import { NotificationList } from "@/components/notification-list";

const HOME_PAGE_QUERY = gql`
  query HomePageData($year: Int!, $month: Int!) {
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
    transactions(first: 5) {
      nodes {
        id
        amount
        storeName
        purchasedAt
        category {
          id
          name
          color
        }
      }
    }
    notifications(first: 5, unreadOnly: true) {
      nodes {
        id
        notifiable {
          __typename
          ... on BudgetAlert {
            category { name }
            threshold
            usagePercent
          }
          ... on PaceAlert {
            category { name }
            month
          }
          ... on UnclassifiedAlert {
            count
          }
        }
      }
    }
  }
`;

export default async function Home() {
  const now = new Date();
  const { data } = await query<HomePageDataQuery>({
    query: HOME_PAGE_QUERY,
    variables: { year: now.getFullYear(), month: now.getMonth() + 1 },
  });

  if (!data) throw new Error("データの取得に失敗しました");

  const { monthlySummary, transactions, notifications } = data;

  // 今月の経過率（理想ペースライン位置）
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const idealPacePercent = Math.round((now.getDate() / daysInMonth) * 100);

  const notificationNodes = (notifications.nodes ?? []).filter((n) => n !== null);

  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
        <header>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            {now.getFullYear()}年{now.getMonth() + 1}月
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">かけいぼ</h1>
        </header>
        {notificationNodes.length > 0 && (
          <NotificationList notifications={notificationNodes} />
        )}
        <SummaryCard
          totalAmount={monthlySummary.totalAmount}
          budgetAmount={monthlySummary.budgetAmount}
          remainingAmount={monthlySummary.remainingAmount}
        />
        <BudgetList
          breakdowns={monthlySummary.categoryBreakdowns}
          idealPacePercent={idealPacePercent}
        />
        <RecentTransactions transactions={(transactions.nodes ?? []).filter((t) => t !== null)} />
      </div>
    </main>
  );
}
