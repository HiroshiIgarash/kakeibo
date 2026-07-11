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
 * カテゴリ別予算カード一覧。
 * 予算未設定の子カテゴリ（外食・自炊など）は表示しない。
 * paceStatus（GREEN/YELLOW/RED）に応じてバッジとプログレスバーを色分けする。
 */
export function BudgetList({ breakdowns, idealPacePercent }: Props) {
  // type predicate で絞り込むことで、以降の budgetAmount は number 型として扱える
  const parentBreakdowns = breakdowns.filter(
    (b): b is CategoryBreakdown & { budgetAmount: number } => b.budgetAmount != null
  );

  return (
    <div>
      <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
        カテゴリ別予算
      </h2>
      <ul role="list" className="flex flex-col gap-3">
        {parentBreakdowns.map((b) => {
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
                  {b.dailyAmount != null && (
                    <p className="mt-2 text-xs text-muted-foreground font-mono">
                      残り ¥{(b.remainingAmount ?? 0).toLocaleString()} · 1日あたり ¥{b.dailyAmount.toLocaleString()}
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
    </div>
  );
}
