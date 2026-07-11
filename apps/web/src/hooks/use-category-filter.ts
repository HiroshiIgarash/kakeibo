import { useState } from "react";
import { useSearchParams } from "next/navigation";

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
 *
 * 選択状態は URL クエリ（?parent=&child=）に保持する。ページは月ごとに
 * key 付きで再マウントされるため、useState だけだと月移動で絞り込みが消える。
 * URL 更新は history.replaceState（Next の shallow routing）で行い、
 * force-dynamic な RSC の再取得を発生させない。
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

  const searchParams = useSearchParams();
  const [selected, setSelectedState] = useState<CategoryFilterSelection>(() => ({
    parentId: searchParams.get("parent"),
    childId: searchParams.get("child"),
  }));

  const setSelected = (next: CategoryFilterSelection) => {
    setSelectedState(next);
    const params = new URLSearchParams(window.location.search);
    if (next.parentId) params.set("parent", next.parentId);
    else params.delete("parent");
    if (next.childId) params.set("child", next.childId);
    else params.delete("child");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    );
  };

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
