import { Card } from "@/components/ui/card";

type Transaction = {
  id: string;
  amount: number;
  storeName: string;
  purchasedAt: string;
  category?: {
    id: string;
    name: string;
    color?: string | null;
  } | null;
};

type Props = {
  transactions: Transaction[];
};

/**
 * ISO8601 の日付文字列（"2026-04-15"）を "4/15" 形式に変換する。
 * split の結果が不足している場合は元の文字列をそのまま返す。
 */
function formatDate(dateStr: string): string {
  const parts = dateStr.split("-");
  const month = parts[1];
  const day = parts[2];
  if (!month || !day) return dateStr;
  return `${parseInt(month)}/${parseInt(day)}`;
}

/**
 * 直近の支出リスト。
 * カテゴリカラーをドットで表示し、未分類（category=null）にも対応する。
 * purchasedAt はISO8601の日付文字列（例: "2026-04-15"）を受け取る。
 */
export function RecentTransactions({ transactions }: Props) {
  return (
    <div>
      <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
        直近の支出
      </h2>
      <Card className="py-0 gap-0 divide-y divide-border">
        {transactions.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: t.category?.color ?? "#D6D3D1" }}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-card-foreground truncate">{t.storeName ?? "未登録"}</p>
              <p className="text-xs text-muted-foreground">{t.category?.name ?? "未分類"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-card-foreground font-mono">
                ¥{t.amount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{formatDate(t.purchasedAt)}</p>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
