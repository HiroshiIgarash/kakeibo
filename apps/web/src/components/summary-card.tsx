import { cn } from "@/lib/utils";
import { budgetUsage } from "@/lib/budget-usage";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Props = {
  totalAmount: number;
  budgetAmount: number;
  remainingAmount: number;
};

/**
 * 月次サマリーカード。
 * 全カテゴリ横断の合計支出・予算・残額をプログレスバーで表示する。
 * 予算超過時はバーと残額を赤で強調し、使用率は 100% を超えた実値を示す。
 * 予算未設定（0円）のときは残額・使用率を出さず「予算未設定」とだけ表示する。
 */
export function SummaryCard({ totalAmount, budgetAmount, remainingAmount }: Props) {
  const usage = budgetUsage(totalAmount, budgetAmount);

  return (
    <Card className="py-0">
      <CardContent className="p-6">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          今月の支出
        </p>
        <div className="mt-3 flex items-end gap-2">
          <span className="text-4xl font-bold tracking-tight text-card-foreground font-mono">
            ¥{totalAmount.toLocaleString()}
          </span>
          {usage.hasBudget && (
            <span className="text-sm text-muted-foreground mb-1 font-mono">
              / ¥{budgetAmount.toLocaleString()}
            </span>
          )}
        </div>
        {usage.hasBudget ? (
          <>
            <Progress
              value={usage.barPercent}
              indicatorClassName={usage.isOver ? "bg-red-400" : undefined}
              aria-label="予算使用率"
              className="mt-4"
            />
            <div className="mt-3 flex justify-between items-center">
              <span
                className={cn(
                  "text-xs",
                  usage.isOver ? "text-red-400 font-medium" : "text-muted-foreground"
                )}
              >
                {usage.percent}% 使用
              </span>
              <span
                className={cn(
                  "text-sm font-medium font-mono",
                  remainingAmount < 0 ? "text-red-400" : "text-muted-foreground"
                )}
              >
                残り ¥{remainingAmount.toLocaleString()}
              </span>
            </div>
          </>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            予算未設定（設定 → 予算設定から登録できます）
          </p>
        )}
      </CardContent>
    </Card>
  );
}
