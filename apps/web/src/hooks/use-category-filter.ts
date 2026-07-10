import { useState } from "react";

type WithCategory = {
  category?: {
    id: string;
    name: string;
    color?: string | null;
    parentId: string | null;
    parentName: string | null;
  } | null;
};

export type CategoryFilterSelection = {
  parentId: string | null;
  childId: string | null;
};

type ParentChip = { id: string; name: string; color?: string | null };
type ChildChip = { id: string; name: string };

/**
 * 親子カテゴリフィルタリングのロジックを共通化するカスタムフック。
 * 取引は常に子カテゴリに割り当てられる（親カテゴリへの直付けは無い）ため、
 * category.parentId をそのまま親チップの絞り込みキーとして使える。
 * transactions/calendar 両画面で同一ロジックが重複していたため抽出。
 */
export function useCategoryFilter<T extends WithCategory>(items: T[]) {
  const parentSeen = new Map<string, ParentChip>();
  for (const item of items) {
    const cat = item.category;
    if (!cat || cat.parentId == null) continue;
    if (!parentSeen.has(cat.parentId)) {
      parentSeen.set(cat.parentId, {
        id: cat.parentId,
        name: cat.parentName ?? cat.name,
        color: cat.color,
      });
    }
  }
  const parents = Array.from(parentSeen.values());

  const [selected, setSelected] = useState<CategoryFilterSelection>({
    parentId: null,
    childId: null,
  });

  const childSeen = new Map<string, ChildChip>();
  if (selected.parentId !== null) {
    for (const item of items) {
      const cat = item.category;
      if (!cat || cat.parentId !== selected.parentId) continue;
      if (!childSeen.has(cat.id)) childSeen.set(cat.id, { id: cat.id, name: cat.name });
    }
  }
  const childrenOfSelected = Array.from(childSeen.values());

  const filtered = items.filter((item) => {
    if (selected.parentId === null) return true;
    const cat = item.category;
    if (!cat || cat.parentId !== selected.parentId) return false;
    if (selected.childId === null) return true;
    return cat.id === selected.childId;
  });

  return { parents, childrenOfSelected, selected, setSelected, filtered };
}
