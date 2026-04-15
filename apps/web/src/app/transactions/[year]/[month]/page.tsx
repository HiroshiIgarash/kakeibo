import { query } from "@/lib/apollo-client";
import { gql } from "@apollo/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MonthNavigator } from "@/components/month-navigator";
import { TransactionsView } from "@/components/transactions-view";

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
      budgetAmount
    }
  }
`;

type Transaction = {
  id: string;
  amount: number;
  storeName: string;
  purchasedAt: string;
  memo?: string | null;
  category?: { id: string; name: string; color?: string | null } | null;
};

type QueryResult = {
  transactions: { nodes: (Transaction | null)[] };
  monthlySummary: { budgetAmount: number };
};

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

  const { data } = await query<QueryResult>({
    query: TRANSACTIONS_PAGE_QUERY,
    variables: { year, month },
  });

  const transactions = (data?.transactions.nodes ?? []).filter(
    (t): t is Transaction => t !== null
  );
  const totalAmount  = transactions.reduce((sum, t) => sum + t.amount, 0);
  const budgetAmount = data?.monthlySummary.budgetAmount ?? 0;

  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
        <header>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← ホームに戻る
          </Link>
          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                支出一覧
              </p>
              <h1 className="text-2xl font-bold text-foreground mt-1">
                {year}年{month}月
              </h1>
            </div>
            <p className="text-sm font-mono text-muted-foreground pb-1">
              合計 ¥{totalAmount.toLocaleString()}
            </p>
          </div>
        </header>

        <MonthNavigator year={year} month={month} />

        <TransactionsView
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
