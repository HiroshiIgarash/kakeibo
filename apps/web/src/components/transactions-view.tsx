"use client";

import { useState } from "react";
import { useCategoryFilter } from "@/hooks/use-category-filter";
import { CategoryFilterChips } from "@/components/category-filter-chips";
import { TransactionList } from "@/components/transaction-list";
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
  } | null;
};

type Props = {
  transactions: Transaction[];
};

export function TransactionsView({ transactions }: Props) {
  const { categories, selectedCategoryId, setSelectedCategoryId, filtered } =
    useCategoryFilter(transactions);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<TransactionForEdit | null>(null);

  const handleTransactionTap = (t: Transaction) => {
    setEditingTransaction({
      id: t.id,
      amount: t.amount,
      storeName: t.storeName,
      purchasedAt: t.purchasedAt,
      categoryId: t.category?.id ?? null,
    });
    setSheetOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <CategoryFilterChips
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />

        <TransactionList
          transactions={filtered}
          onTransactionTap={handleTransactionTap}
        />
      </div>

      <TransactionFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        transaction={editingTransaction}
      />
    </>
  );
}
