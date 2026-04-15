"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { CalendarView } from "@/components/calendar-view";
import { TransactionList } from "@/components/transaction-list";

type Category = {
  id: string;
  name: string;
  color?: string | null;
};

type Transaction = {
  id: string;
  amount: number;
  storeName: string;
  purchasedAt: string;
  memo?: string | null;
  category?: Category | null;
};

type Props = {
  transactions: Transaction[];
  year: number;
  month: number;
  budgetAmount: number;
};

export function TransactionsView({ transactions, year, month, budgetAmount }: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // 今月の取引に登場するカテゴリを重複なく抽出
  const categories = useMemo<Category[]>(() => {
    const seen = new Map<string, Category>();
    for (const t of transactions) {
      if (t.category && !seen.has(t.category.id)) {
        seen.set(t.category.id, t.category);
      }
    }
    return Array.from(seen.values());
  }, [transactions]);

  const filtered = useMemo(
    () =>
      selectedCategoryId === null
        ? transactions
        : transactions.filter((t) => t.category?.id === selectedCategoryId),
    [transactions, selectedCategoryId]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* カテゴリフィルターチップ */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
              selectedCategoryId === null
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            すべて
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                setSelectedCategoryId(
                  selectedCategoryId === cat.id ? null : cat.id
                )
              }
              className={cn(
                "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                selectedCategoryId === cat.id
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {cat.color && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
              )}
              {cat.name}
            </button>
          ))}
        </div>
      )}

      <CalendarView
        transactions={filtered}
        year={year}
        month={month}
        budgetAmount={budgetAmount}
      />

      <TransactionList transactions={filtered} />
    </div>
  );
}
