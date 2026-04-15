import { cn } from "@/lib/utils";

type Transaction = {
  id: string;
  amount: number;
  purchasedAt: string;
};

type Props = {
  transactions: Transaction[];
  year: number;
  month: number;
  budgetAmount: number;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** ¥1,250 形式（k 省略なし）でフォーマット */
function formatAmount(n: number): string {
  return `¥${n.toLocaleString()}`;
}

/**
 * サーマルグラデーション定義（ティールミスト・極淡め）
 * near-white → soft teal
 */
const THERMAL_STOPS: readonly [number, number, number][] = [
  [250, 250, 249], // near-white
  [234, 246, 245], // teal tint 25%
  [217, 241, 240], // teal tint 50%
  [201, 237, 236], // teal tint 75%
  [184, 232, 231], // soft teal max
];

/**
 * 支出強度 t (0〜1) を sqrt スケールで補間し、背景色を返す。
 * sqrt スケールで小〜中額の色差を広げ、少額日も確実に識別できるようにする。
 */
function thermalColor(t: number): string {
  const td = Math.max(0.10, Math.sqrt(t));
  const x  = td * (THERMAL_STOPS.length - 1);
  const lo = Math.floor(x);
  const hi = Math.min(lo + 1, THERMAL_STOPS.length - 1);
  const f  = x - lo;

  const [r0, g0, b0] = THERMAL_STOPS[lo]!;
  const [r1, g1, b1] = THERMAL_STOPS[hi]!;
  const r = Math.round(r0 + f * (r1 - r0));
  const g = Math.round(g0 + f * (g1 - g0));
  const b = Math.round(b0 + f * (b1 - b0));

  return `rgb(${r},${g},${b})`;
}

/**
 * 月カレンダー（サーマルマップ版）。
 * - 支出量に応じてセル背景色が変化（白 → ソフトティール）
 * - 今日は右上に「今日」ラベルを表示
 * - 金額は中央揃え・k省略なし
 */
export function CalendarView({ transactions, year, month, budgetAmount }: Props) {
  const dailyTotals = new Map<number, number>();
  for (const t of transactions) {
    const day = parseInt(t.purchasedAt.split("-")[2] ?? "0", 10);
    if (day > 0) dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + t.amount);
  }

  const daysInMonth  = new Date(year, month, 0).getDate();
  // 日割り予算：月予算 ÷ 日数（未設定の場合は正規化しない）
  const dailyBudget  = budgetAmount > 0 ? budgetAmount / daysInMonth : null;
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const today        = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDay     = isCurrentMonth ? today.getDate() : -1;
  const totalRows    = Math.ceil((firstWeekday + daysInMonth) / 7);

  return (
    <div>
      <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
        カレンダー
      </h2>

      <div className="rounded-xl overflow-hidden border border-border bg-card shadow-sm">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/20">
          {WEEKDAYS.map((wd, i) => (
            <div
              key={wd}
              className={cn(
                "text-center text-[11px] font-semibold py-2.5",
                i === 0 ? "text-rose-400" : i === 6 ? "text-sky-400" : "text-muted-foreground"
              )}
            >
              {wd}
            </div>
          ))}
        </div>

        {/* 日付グリッド（行単位） */}
        <div className="divide-y divide-border">
          {Array.from({ length: totalRows }, (_, rowIdx) => (
            <div key={rowIdx} className="grid grid-cols-7 divide-x divide-border">
              {Array.from({ length: 7 }, (_, colIdx) => {
                const dayNum  = rowIdx * 7 + colIdx - firstWeekday + 1;
                const isValid = dayNum >= 1 && dayNum <= daysInMonth;

                if (!isValid) {
                  return <div key={`e-${rowIdx}-${colIdx}`} className="h-[64px]" />;
                }

                const total   = dailyTotals.get(dayNum);
                const isToday = dayNum === todayDay;
                const isSun   = colIdx === 0;
                const isSat   = colIdx === 6;

                // 日割り予算の2倍を上限としてグラデーション。予算未設定時は色なし
                const bgColor = total !== undefined && dailyBudget !== null
                  ? thermalColor(Math.min(total / (dailyBudget * 2), 1))
                  : undefined;

                return (
                  <div
                    key={dayNum}
                    className="h-[64px] flex flex-col px-1.5 pt-1.5 pb-2"
                    style={bgColor ? { backgroundColor: bgColor } : undefined}
                  >
                    {/* 上行：日付（左）＋「今日」ラベル（右） */}
                    <div className="flex items-start justify-between w-full">
                      <span
                        className={cn(
                          "text-[11px] font-semibold w-[22px] h-[22px] flex items-center justify-center rounded-full leading-none flex-shrink-0 text-card-foreground",
                          !isToday && isSun && "text-rose-400",
                          !isToday && isSat && "text-sky-400",
                        )}
                      >
                        {dayNum}
                      </span>
                      {isToday && (
                        <span className="text-[9px] font-bold leading-none tracking-[.04em] pt-px text-rose-400 flex-shrink-0">
                          今日
                        </span>
                      )}
                    </div>

                    {/* 支出金額（下・中央揃え） */}
                    {total !== undefined && (
                      <span className="text-[11px] font-mono font-semibold leading-none mt-auto w-full text-center text-amber-800/70">
                        {formatAmount(total)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
