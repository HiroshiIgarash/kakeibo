"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Transaction = {
  id: string;
  amount: number;
  storeName: string;
  purchasedAt: string;
  memo?: string | null;
  category?: {
    id: string;
    name: string;
    color?: string | null;
    parentId: string | null;
    parentName: string | null;
  } | null;
};

type Props = {
  transactions: Transaction[];
  onTransactionTap?: (transaction: Transaction) => void;
  onAddClick?: () => void;
};

/**
 * "2026-04-15" → { label: "4月15日（水）", sortKey: "2026-04-15" }
 */
function parseDateLabel(dateStr: string): { label: string; sortKey: string } {
  const parts = dateStr.split("-");
  const year = parseInt(parts[0] ?? "0", 10);
  const month = parseInt(parts[1] ?? "0", 10);
  const day = parseInt(parts[2] ?? "0", 10);
  const d = new Date(year, month - 1, day);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()] ?? "";
  return {
    label: `${month}月${day}日（${weekday}）`,
    sortKey: dateStr,
  };
}

/**
 * 支出一覧。purchasedAt の降順で日付グループに分けて表示する。
 */
export function TransactionList({ transactions, onTransactionTap, onAddClick }: Props) {
  if (transactions.length === 0) {
    return (
      <div>
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          支出一覧
        </h2>
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-muted-foreground text-center">
            この月の支出はありません
          </p>
          {onAddClick && (
            <button
              type="button"
              onClick={onAddClick}
              className="px-4 py-3 rounded-xl border border-border text-sm text-foreground hover:bg-muted transition-colors"
            >
              支出を追加
            </button>
          )}
        </div>
      </div>
    );
  }

  // 日付でグループ化（降順ソート）
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const existing = groups.get(t.purchasedAt) ?? [];
    existing.push(t);
    groups.set(t.purchasedAt, existing);
  }
  const sortedDates = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
        支出一覧
      </h2>
      <div className="flex flex-col gap-4">
        {sortedDates.map((dateStr) => {
          const items = groups.get(dateStr) ?? [];
          const dayTotal = items.reduce((sum, t) => sum + t.amount, 0);
          const { label } = parseDateLabel(dateStr);

          return (
            <div key={dateStr}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <span className="text-xs font-mono text-muted-foreground">
                  ¥{dayTotal.toLocaleString()}
                </span>
              </div>
              <Card className="py-0 gap-0 divide-y divide-border overflow-hidden">
                {items.map((t) => {
                  const content = (
                    <>
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: t.category?.color ?? "#D6D3D1" }}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-card-foreground truncate">
                          {t.storeName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.category?.name ?? "未分類"}
                          {t.memo && ` · ${t.memo}`}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-card-foreground font-mono flex-shrink-0">
                        ¥{t.amount.toLocaleString()}
                      </p>
                    </>
                  );

                  return onTransactionTap ? (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onTransactionTap(t)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 w-full text-left",
                        "hover:bg-muted/50 active:bg-muted transition-colors"
                      )}
                    >
                      {content}
                    </button>
                  ) : (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                      {content}
                    </div>
                  );
                })}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
