"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { X, Trash2 } from "lucide-react";
import { createTransaction, updateTransaction, deleteTransaction } from "@/actions/transactions";
import { getCategoryOptions } from "@/actions/categories";
import type { CategoryOption } from "@/lib/queries";

export type TransactionForEdit = {
  id: string;
  amount: number;
  storeName: string;
  purchasedAt: string;
  categoryId?: string | null;
};

/** 子カテゴリ一覧を親名でグルーピングする（挿入順 = loader のソート順を保持） */
function groupByParent(categories: CategoryOption[]): Map<string, CategoryOption[]> {
  const grouped = new Map<string, CategoryOption[]>();
  for (const cat of categories) {
    const list = grouped.get(cat.parentName);
    if (list) {
      list.push(cat);
    } else {
      grouped.set(cat.parentName, [cat]);
    }
  }
  return grouped;
}

type Props = {
  open: boolean;
  onClose: () => void;
  transaction?: TransactionForEdit | null;
  defaultDate?: string;
};

type FormContentProps = {
  transaction?: TransactionForEdit | null;
  defaultDate?: string;
  onClose: () => void;
};

/** ローカル日付を "YYYY-MM-DD" で返す（toISOString はUTCのため JST では前日になる場合がある） */
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * フォームの中身。key prop が変わるたびに React がリマウントするため、
 * useEffect なしで props からの初期値リセットを実現している。
 */
function FormContent({ transaction, defaultDate, onClose }: FormContentProps) {
  const router = useRouter();
  const isEdit = Boolean(transaction);

  // useState の初期値を props から直接設定（useEffect 不要）
  const [storeName, setStoreName] = useState(transaction?.storeName ?? "");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [purchasedAt, setPurchasedAt] = useState(
    transaction?.purchasedAt ?? defaultDate ?? todayStr()
  );
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmUncategorized, setConfirmUncategorized] = useState(false);

  // null = ロード中。ロード完了まで送信不可にして「選択肢が届く前に未分類で確定」を防ぐ
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const categoriesLoading = categories === null;
  useEffect(() => {
    let active = true;
    getCategoryOptions().then((cats) => { if (active) setCategories(cats); });
    return () => { active = false; };
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [deletingState, setDeletingState] = useState(false);
  const loading = submitting || deletingState;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrors(["金額は1以上の数値を入力してください"]);
      return;
    }
    if (!categoryId && !confirmUncategorized) {
      setConfirmUncategorized(true);
      return;
    }
    setSubmitting(true);
    try {
      const result = isEdit && transaction
        ? await updateTransaction({ id: transaction.id, storeName: storeName.trim(), amount: parsedAmount, purchasedAt, categoryId: categoryId || null })
        : await createTransaction({ storeName: storeName.trim(), amount: parsedAmount, purchasedAt, categoryId: categoryId || null });
      if (result.errors.length > 0) { setErrors(result.errors); return; }
      router.refresh();
      onClose();
    } catch {
      setErrors(["エラーが発生しました"]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!transaction) return;
    setDeletingState(true);
    try {
      const result = await deleteTransaction({ id: transaction.id });
      if (result.errors.length > 0) { setErrors(result.errors); return; }
      router.refresh();
      onClose();
    } catch {
      setErrors(["削除に失敗しました"]);
    } finally {
      setDeletingState(false);
    }
  };

  return (
    <div className="px-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between pt-3 pb-4 border-b border-border">
        <Dialog.Title className="text-base font-bold text-foreground">
          {isEdit ? "支出を編集" : "支出を追加"}
        </Dialog.Title>
        <Dialog.Close
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          aria-label="閉じる"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </Dialog.Close>
      </div>

      <form onSubmit={handleSubmit} className="py-5 flex flex-col gap-4">
        {/* Store name */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            店舗名
          </span>
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="例: スーパーマーケット"
            required
            autoComplete="off"
            autoFocus={!isEdit}
            className="w-full px-3.5 py-3 rounded-xl border border-border bg-muted/30 text-foreground text-base placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/25 focus:bg-background transition-colors"
          />
        </label>

        {/* Amount */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            金額（円）
          </span>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-sm select-none">
              ¥
            </span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
              min={1}
              inputMode="numeric"
              className="w-full pl-7 pr-3.5 py-3 rounded-xl border border-border bg-muted/30 text-foreground text-base font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/25 focus:bg-background transition-colors"
            />
          </div>
        </label>

        {/* Date */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            日付
          </span>
          <input
            type="date"
            value={purchasedAt}
            onChange={(e) => setPurchasedAt(e.target.value)}
            required
            className="w-full px-3.5 py-3 rounded-xl border border-border bg-muted/30 text-foreground text-base focus:outline-none focus:border-foreground/25 focus:bg-background transition-colors"
          />
        </label>

        {/* Category */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            カテゴリ
          </span>
          <div className="relative">
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setConfirmUncategorized(false);
              }}
              disabled={categoriesLoading}
              className="w-full px-3.5 py-3 rounded-xl border border-border bg-muted/30 text-foreground text-base focus:outline-none focus:border-foreground/25 focus:bg-background transition-colors appearance-none disabled:opacity-60"
            >
              {categoriesLoading ? (
                <option value={categoryId}>読み込み中...</option>
              ) : (
                <>
                  <option value="">未分類</option>
                  {Array.from(groupByParent(categories)).map(([parentName, children]) => (
                    <optgroup key={parentName} label={parentName}>
                      {children.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </>
              )}
            </select>
            <svg
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </label>

        {/* Error message */}
        {errors.length > 0 && (
          <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/30 rounded-xl px-3.5 py-2.5">
            {errors.join(" / ")}
          </p>
        )}

        {/* Uncategorized warning */}
        {confirmUncategorized && !categoryId && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-3.5 py-2.5">
            カテゴリが未分類のままです。カテゴリ別の予算には計上されません。
          </p>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading || categoriesLoading}
          className="mt-1 w-full py-3.5 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {loading
            ? "保存中..."
            : confirmUncategorized && !categoryId
              ? "未分類のまま保存する"
              : isEdit
                ? "更新する"
                : "追加する"}
        </button>

        {/* Delete */}
        {isEdit && !showDeleteConfirm && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 rounded-xl text-sm text-rose-500 flex items-center justify-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            削除する
          </button>
        )}

        {isEdit && showDeleteConfirm && (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deletingState}
              className="flex-1 py-3 rounded-xl bg-rose-500 text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {deletingState ? "削除中..." : "削除する"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export function TransactionFormSheet({ open, onClose, transaction, defaultDate }: Props) {
  // key が変わるたびに FormContent がリマウントされ、useState の初期値がリセットされる
  const formKey = open
    ? `${transaction?.id ?? "new"}-${defaultDate ?? ""}`
    : "closed";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Backdrop className="fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />

        {/* Bottom sheet popup */}
        <Dialog.Popup className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-background rounded-t-2xl shadow-2xl outline-none transition-transform duration-300 ease-out data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-0.5" aria-hidden="true">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          <FormContent
            key={formKey}
            transaction={transaction}
            defaultDate={defaultDate}
            onClose={onClose}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
