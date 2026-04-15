import { cn } from "@/lib/utils";
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
 * 予算超過時はバーと残額を赤で強調する。
 */
export function SummaryCard({ totalAmount, budgetAmount, remainingAmount }: Props) {
  const usagePercent =
    budgetAmount > 0 ? Math.min(Math.round((totalAmount / budgetAmount) * 100), 100) : 0;
  const isOver = totalAmount > budgetAmount;

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
          <span className="text-sm text-muted-foreground mb-1 font-mono">
            / ¥{budgetAmount.toLocaleString()}
          </span>
        </div>
        <Progress
          value={usagePercent}
          indicatorClassName={isOver ? "bg-red-400" : undefined}
          aria-label="予算使用率"
          className="mt-4"
        />
        <div className="mt-3 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{usagePercent}% 使用</span>
          <span
            className={cn(
              "text-sm font-medium font-mono",
              remainingAmount < 0 ? "text-red-400" : "text-muted-foreground"
            )}
          >
            残り ¥{remainingAmount.toLocaleString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
