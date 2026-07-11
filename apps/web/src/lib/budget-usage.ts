/**
 * 予算使用率の表示用計算。
 * - percent: 実際の使用率（100 を超え得る）。超過幅をテキストで示すために丸めない
 * - barPercent: プログレスバー用に 100 で頭打ちした値
 * - 予算が 0 円以下は「未設定」扱い（0% なのに赤残額、のような矛盾表示を防ぐ）
 */
export type BudgetUsage =
  | { hasBudget: false }
  | { hasBudget: true; percent: number; barPercent: number; isOver: boolean };

export function budgetUsage(spent: number, budget: number): BudgetUsage {
  if (budget <= 0) return { hasBudget: false };
  const percent = Math.round((spent / budget) * 100);
  return {
    hasBudget: true,
    percent,
    barPercent: Math.min(percent, 100),
    isOver: spent > budget,
  };
}
