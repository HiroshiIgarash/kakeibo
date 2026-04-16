import { useState } from "react";

type WithCategory = {
  category?: {
    id: string;
    name: string;
    color?: string | null;
  } | null;
};

/**
 * カテゴリフィルタリングのロジックを共通化するカスタムフック。
 * transactions/calendar 両画面で同一ロジックが重複していたため抽出。
 */
export function useCategoryFilter<T extends WithCategory>(items: T[]) {
  const seen = new Map<string, { id: string; name: string; color?: string | null }>();
  for (const item of items) {
    if (item.category && !seen.has(item.category.id)) {
      seen.set(item.category.id, item.category);
    }
  }
  const categories = Array.from(seen.values());

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const filtered =
    selectedCategoryId === null
      ? items
      : items.filter((t) => t.category?.id === selectedCategoryId);

  return { categories, selectedCategoryId, setSelectedCategoryId, filtered };
}
