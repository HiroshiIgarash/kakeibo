import { useState, useMemo } from "react";

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
  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color?: string | null }>();
    for (const item of items) {
      if (item.category && !seen.has(item.category.id)) {
        seen.set(item.category.id, item.category);
      }
    }
    return Array.from(seen.values());
  }, [items]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      selectedCategoryId === null
        ? items
        : items.filter((t) => t.category?.id === selectedCategoryId),
    [items, selectedCategoryId]
  );

  return { categories, selectedCategoryId, setSelectedCategoryId, filtered };
}
