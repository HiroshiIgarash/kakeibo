"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveBudgetPlan } from "@/actions/budgets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PlanCategory = {
  categoryId: string;
  categoryName: string;
  currentAmount: number | null;
  lastMonthSpent: number;
};

type Props = {
  month: string; // 'YYYY-MM-01'
  backHref: string;
  prevMonthLabel: string; // '2026年6月'
  lastMonthTotalSpent: number;
  lastMonthTotalBudget: number;
  currentTotalBudget: number;
  categories: PlanCategory[];
};

/** 数値input文字列 → 正の整数 or null（空・不正はnull） */
function parseAmount(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * 予算一括調整ウィザード。
 * ステップ①で全体額（配分ガイド。保存しない）を決め、ステップ②でカテゴリへ配分する。
 * 全体額と配分合計の不一致は警告表示のみで保存可能。
 */
export function BudgetPlanWizard({
  month,
  backHref,
  prevMonthLabel,
  lastMonthTotalSpent,
  lastMonthTotalBudget,
  currentTotalBudget,
  categories,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [totalInput, setTotalInput] = useState(
    String(currentTotalBudget > 0 ? currentTotalBudget : lastMonthTotalSpent || ""),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(
      categories.map((c) => [c.categoryId, c.currentAmount == null ? "" : String(c.currentAmount)]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = parseAmount(totalInput) ?? 0;
  const allocated = categories.reduce(
    (acc, c) => acc + (parseAmount(amounts[c.categoryId]) ?? 0),
    0,
  );
  const remaining = total - allocated;

  async function handleSave() {
    setError(null);
    setSaving(true);
    const result = await saveBudgetPlan({
      month,
      items: categories.map((c) => ({
        categoryId: c.categoryId,
        amount: parseAmount(amounts[c.categoryId]),
      })),
    });
    setSaving(false);
    if (result.errors.length > 0) {
      setError(result.errors.join(", "));
      return;
    }
    router.push(backHref);
    router.refresh();
  }

  if (step === 1) {
    return (
      <Card className="py-0">
        <CardContent className="p-5 flex flex-col gap-4">
          <p className="text-sm font-medium text-card-foreground">
            ① 今月全体でいくら使うかを決める
          </p>
          <dl className="text-xs text-muted-foreground flex flex-col gap-1 font-mono">
            <div className="flex justify-between">
              <dt>{prevMonthLabel}の支出</dt>
              <dd>¥{lastMonthTotalSpent.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{prevMonthLabel}の予算合計</dt>
              <dd>¥{lastMonthTotalBudget.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt>現在の予算合計</dt>
              <dd>¥{currentTotalBudget.toLocaleString()}</dd>
            </div>
          </dl>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">¥</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={totalInput}
              onChange={(e) => setTotalInput(e.target.value)}
              placeholder="全体の予算額"
              autoFocus
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={total <= 0} onClick={() => setStep(2)}>
              次へ：カテゴリに配分
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 配分サマリー（スクロールしても見える固定表示） */}
      <div className="sticky top-0 z-10 rounded-lg border border-border bg-card text-card-foreground p-4 shadow-sm">
        <p className="text-sm font-medium mb-1">② カテゴリに配分する</p>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-muted-foreground">全体 ¥{total.toLocaleString()}</span>
          <span className="text-muted-foreground">配分済み ¥{allocated.toLocaleString()}</span>
          <span className={cn("font-medium", remaining < 0 ? "text-red-500" : "text-emerald-600")}>
            {remaining < 0
              ? `¥${Math.abs(remaining).toLocaleString()} オーバー`
              : `残り ¥${remaining.toLocaleString()}`}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {categories.map((c) => (
          <div
            key={c.categoryId}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card text-card-foreground"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.categoryName}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {prevMonthLabel}: ¥{c.lastMonthSpent.toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">¥</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={amounts[c.categoryId]}
                onChange={(e) =>
                  setAmounts((prev) => ({ ...prev, [c.categoryId]: e.target.value }))
                }
                placeholder="未設定"
                className="w-28 text-right"
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        空欄はこの月の設定なし（過去に設定した月があればその額を引き継ぎます）。
        全体額はガイドのため、合計が一致していなくても保存できます。
      </p>
      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>
          全体額を変更
        </Button>
        <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "この内容で設定"}
        </Button>
      </div>
    </div>
  );
}
