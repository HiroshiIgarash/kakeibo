/** 親カテゴリの色プリセット（設定画面・TOP 分類パネルで共用） */
export const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#84cc16",
];

/** 既存親カテゴリが未使用のプリセット色を返す。全色使用済みなら先頭色。 */
export function pickUnusedColor(usedColors: (string | null)[]): string {
  const used = new Set(usedColors.filter((c): c is string => c != null));
  return PRESET_COLORS.find((c) => !used.has(c)) ?? PRESET_COLORS[0];
}
