"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useCategoryFilter } from "@/hooks/use-category-filter";
import { CategoryFilterChips } from "@/components/category-filter-chips";
import { CalendarView } from "@/components/calendar-view";
import { Card } from "@/components/ui/card";
import {
  TransactionFormSheet,
  type TransactionForEdit,
} from "@/components/transaction-form-sheet";

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
  year: number;
  month: number;
  budgetAmount: number;
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function formatDayLabel(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day);
  const wd = WEEKDAY_LABELS[d.getDay()] ?? "";
  return `${month}月${day}日（${wd}）`;
}

export function CalendarPageContent({ transactions, year, month, budgetAmount }: Props) {
  const { parents, childrenOfSelected, selected, setSelected, filtered } =
    useCategoryFilter(transactions);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionForEdit | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);

  // 選択日の支出一覧
  const dayTransactions =
    selectedDay === null
      ? []
      : filtered.filter((t) => {
          const dayStr = String(selectedDay).padStart(2, "0");
          const monthStr = String(month).padStart(2, "0");
          return t.purchasedAt === `${year}-${monthStr}-${dayStr}`;
        });

  const dayTotal = dayTransactions.reduce((sum, t) => sum + t.amount, 0);

  const handleDayTap = (day: number) => {
    setSelectedDay((prev) => (prev === day ? null : day));
  };

  const handleTransactionTap = (t: Transaction) => {
    setEditingTransaction({
      id: t.id,
      amount: t.amount,
      storeName: t.storeName,
      purchasedAt: t.purchasedAt,
      categoryId: t.category?.id ?? null,
    });
    setDefaultDate(undefined); // 編集時は defaultDate をリセットしてステールを防ぐ
    setSheetOpen(true);
  };

  const handleAddForDay = (day: number) => {
    const dayStr = String(day).padStart(2, "0");
    const monthStr = String(month).padStart(2, "0");
    setEditingTransaction(null);
    setDefaultDate(`${year}-${monthStr}-${dayStr}`);
    setSheetOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <CategoryFilterChips
          parents={parents}
          childrenOfSelected={childrenOfSelected}
          selected={selected}
          onSelect={setSelected}
        />

        <CalendarView
          transactions={filtered}
          year={year}
          month={month}
          budgetAmount={budgetAmount}
          selectedDay={selectedDay}
          onDayTap={handleDayTap}
        />

        {/* 日付タップ時の支出詳細パネル */}
        {selectedDay !== null && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                {formatDayLabel(year, month, selectedDay)}
              </h3>
              <div className="flex items-center gap-3">
                {dayTransactions.length > 0 && (
                  <span className="text-xs font-mono text-muted-foreground">
                    ¥{dayTotal.toLocaleString()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleAddForDay(selectedDay)}
                  className="flex items-center gap-1 text-xs font-semibold text-foreground hover:opacity-70 transition-opacity"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                  追加
                </button>
              </div>
            </div>

            {dayTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
                この日の支出はありません
              </p>
            ) : (
              <Card className="py-0 gap-0 divide-y divide-border overflow-hidden">
                {dayTransactions.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleTransactionTap(t)}
                    className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-muted/50 active:bg-muted transition-colors"
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.category?.color ?? "#D6D3D1" }}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-card-foreground truncate">{t.storeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.category?.name ?? "未分類"}
                        {t.memo && ` · ${t.memo}`}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-card-foreground font-mono flex-shrink-0">
                      ¥{t.amount.toLocaleString()}
                    </p>
                  </button>
                ))}
              </Card>
            )}
          </div>
        )}
      </div>

      <TransactionFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        transaction={editingTransaction}
        defaultDate={defaultDate}
      />
    </>
  );
}
