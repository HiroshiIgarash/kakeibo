"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upsertBudget, deleteBudget, copyBudgetsFromPreviousMonth } from "@/actions/budgets";
import type { BudgetSettingRow } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Copy, Loader2 } from "lucide-react";

// ────────────────────────────────────────────────────────────────
// 予算行（金額のインライン編集・行ごと保存）
// ────────────────────────────────────────────────────────────────
function BudgetRow({ row, month }: { row: BudgetSettingRow; month: string }) {
  const router = useRouter();
  const [value, setValue] = useState(row.amount == null ? "" : String(row.amount));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = value !== (row.amount == null ? "" : String(row.amount));

  async function handleSave() {
    setError(null);
    setSaving(true);
    let result;
    if (value.trim() === "") {
      // 空欄で保存 = その月の予算を削除（未設定なら何もしない）
      result = row.budgetId ? await deleteBudget({ id: row.budgetId }) : { errors: [] };
    } else {
      const amount = Number(value);
      if (!Number.isInteger(amount) || amount <= 0) {
        setSaving(false);
        setError("金額は1以上の整数で入力してください");
        return;
      }
      result = await upsertBudget({ categoryId: row.categoryId, month, amount });
    }
    setSaving(false);
    if (result.errors.length > 0) {
      setError(result.errors.join(", "));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3">
        <p className="flex-1 min-w-0 text-sm font-medium text-card-foreground truncate">
          {row.categoryName}
        </p>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">¥</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="未設定"
            className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button type="button" size="sm" disabled={saving || !dirty} onClick={handleSave}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "保存"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────────────
type Props = {
  rows: BudgetSettingRow[];
  month: string; // 'YYYY-MM-01'
  monthLabel: string; // 'YYYY年M月'
  prevHref: string;
  nextHref: string;
};

export function BudgetSettingsContent({ rows, month, monthLabel, prevHref, nextHref }: Props) {
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    setError(null);
    setMessage(null);
    setCopying(true);
    const result = await copyBudgetsFromPreviousMonth({ month });
    setCopying(false);
    if (result.errors.length > 0) {
      setError(result.errors.join(", "));
      return;
    }
    setMessage(
      result.copied && result.copied > 0
        ? `前月から${result.copied}件コピーしました`
        : "コピー対象がありませんでした（前月が未設定、または全カテゴリ設定済み）",
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        カテゴリごとの月次予算を設定します。空欄で保存するとその月の予算を解除します。
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href={prevHref} className="p-1 rounded hover:bg-muted transition-colors" aria-label="前の月">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <p className="text-sm font-semibold tabular-nums">{monthLabel}</p>
          <Link href={nextHref} className="p-1 rounded hover:bg-muted transition-colors" aria-label="次の月">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={copying} onClick={handleCopy}>
          {copying ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 mr-1" />
              前月からコピー
            </>
          )}
        </Button>
      </div>

      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground text-center">
              カテゴリがありません。先にカテゴリ管理から登録してください。
            </CardContent>
          </Card>
        ) : (
          rows.map((r) => <BudgetRow key={`${r.categoryId}-${month}`} row={r} month={month} />)
        )}
      </div>
    </div>
  );
}
