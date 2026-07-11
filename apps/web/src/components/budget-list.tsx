import Link from "next/link";
import { cn } from "@/lib/utils";
import { budgetUsage } from "@/lib/budget-usage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

// gql 由来の PaceStatus enum をローカルの文字列 union に置換
type PaceStatus = "GREEN" | "YELLOW" | "RED";

type CategoryChildBreakdown = {
  categoryId: string;
  categoryName: string;
  amount: number;
};

type CategoryBreakdown = {
  categoryId: string;
  categoryName: string;
  amount: number;
  paceStatus?: PaceStatus | null;
  budgetAmount?: number | null;
  remainingAmount?: number | null;
  dailyAmount?: number | null;
  children?: CategoryChildBreakdown[];
};

type Props = {
  breakdowns: CategoryBreakdown[];
  /** 今月の経過率（0〜100）。理想ペースラインの縦線位置に使用する */
  idealPacePercent: number;
  /** カテゴリ未設定の取引合計。0 より大きいときのみ「未分類」行を表示する */
  unclassifiedAmount: number;
};

const paceConfig: Record<PaceStatus, { label: string; className: string }> = {
  GREEN:  { label: "順調", className: "bg-emerald-50 text-emerald-700 border-transparent" },
  YELLOW: { label: "注意", className: "bg-amber-50 text-amber-700 border-transparent" },
  RED:    { label: "超過", className: "bg-red-50 text-red-600 border-transparent" },
};

const paceIndicatorClass: Record<PaceStatus, string> = {
  GREEN:  "bg-emerald-400",
  YELLOW: "bg-amber-400",
  RED:    "bg-red-400",
};

/**
 * カテゴリ別の支出一覧。
 * 予算ありカテゴリはカード（バー・バッジ付き）、予算なしカテゴリは軽量な行で表示し、
 * 末尾にカテゴリ未設定の「未分類」合計を出す（セクション合計 = 月の総支出になる）。
 * paceStatus（GREEN/YELLOW/RED）に応じてバッジとプログレスバーを色分けする。
 */
export function BudgetList({ breakdowns, idealPacePercent, unclassifiedAmount }: Props) {
  // type predicate で絞り込むことで、以降の budgetAmount は number 型として扱える
  const budgeted = breakdowns.filter(
    (b): b is CategoryBreakdown & { budgetAmount: number } => b.budgetAmount != null
  );
  const unbudgeted = breakdowns
    .filter((b) => b.budgetAmount == null && b.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (budgeted.length === 0 && unbudgeted.length === 0 && unclassifiedAmount <= 0) {
    return (
      <div>
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          カテゴリ別
        </h2>
        <p className="text-sm text-muted-foreground">
          カテゴリ別の予算が未設定です。
          <Link href="/settings/budgets" className="underline underline-offset-2 hover:text-foreground">
            予算設定
          </Link>
          から登録できます。
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
        カテゴリ別
      </h2>
      <ul role="list" className="flex flex-col gap-3">
        {budgeted.map((b) => {
          const usage = budgetUsage(b.amount, b.budgetAmount);
          const pace = b.paceStatus ? paceConfig[b.paceStatus] : null;
          const indicatorClass = b.paceStatus ? paceIndicatorClass[b.paceStatus] : undefined;

          return (
            <li key={b.categoryId} className="list-none">
              <Card className="py-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-card-foreground">{b.categoryName}</span>
                    {pace && (
                      <Badge className={cn(pace.className)}>{pace.label}</Badge>
                    )}
                  </div>
                  <div className="flex items-end justify-between mb-2">
                    <span className="text-xl font-bold tracking-tight text-card-foreground font-mono">
                      ¥{b.amount.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      / ¥{b.budgetAmount.toLocaleString()}
                      {usage.hasBudget && usage.isOver && (
                        <span className="text-red-400 font-medium"> · {usage.percent}%</span>
                      )}
                    </span>
                  </div>
                  {/* プログレスバー + 理想ペースライン縦線 */}
                  <div className="relative">
                    <Progress
                      value={usage.hasBudget ? usage.barPercent : 0}
                      indicatorClassName={indicatorClass}
                      aria-label={`${b.categoryName} 予算使用率`}
                    />
                    <div
                      className="absolute top-0 h-full w-0.5 bg-muted-foreground opacity-60 rounded-full"
                      style={{ left: `${idealPacePercent}%` }}
                      title={`理想ペース: ${idealPacePercent}%`}
                    />
                  </div>
                  {b.remainingAmount != null && (
                    <p className="mt-2 text-xs text-muted-foreground font-mono">
                      残り ¥{b.remainingAmount.toLocaleString()}
                      {b.dailyAmount != null && <> · 1日あたり ¥{b.dailyAmount.toLocaleString()}</>}
                    </p>
                  )}
                  {b.children != null && b.children.length > 0 && (
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer select-none">内訳</summary>
                      <ul role="list" className="mt-1 flex flex-col gap-1">
                        {b.children.map((child) => (
                          <li
                            key={child.categoryId}
                            className="list-none flex items-center justify-between"
                          >
                            <span>{child.categoryName}</span>
                            <span className="font-mono">¥{child.amount.toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {unbudgeted.length > 0 && (
        <ul role="list" className="flex flex-col gap-2 mt-3">
          {unbudgeted.map((b) => (
            <li key={b.categoryId} className="list-none">
              <div className="px-4 py-3 rounded-lg border border-border bg-card text-card-foreground">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{b.categoryName}</span>
                  <span className="text-sm font-mono">
                    ¥{b.amount.toLocaleString()}
                    <span className="ml-2 text-xs text-muted-foreground">予算未設定</span>
                  </span>
                </div>
                {b.children != null && b.children.length > 0 && (
                  <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none">内訳</summary>
                    <ul role="list" className="mt-1 flex flex-col gap-1">
                      {b.children.map((child) => (
                        <li
                          key={child.categoryId}
                          className="list-none flex items-center justify-between"
                        >
                          <span>{child.categoryName}</span>
                          <span className="font-mono">¥{child.amount.toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {unclassifiedAmount > 0 && (
        <div className="mt-2 px-4 py-3 rounded-lg border border-dashed border-border text-muted-foreground flex items-center justify-between">
          <span className="text-sm">未分類</span>
          <span className="text-sm font-mono">¥{unclassifiedAmount.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
