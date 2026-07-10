"use client";

import { cn } from "@/lib/utils";
import type { CategoryFilterSelection } from "@/hooks/use-category-filter";

type ParentChip = { id: string; name: string; color?: string | null };
type ChildChip = { id: string; name: string };

type Props = {
  parents: ParentChip[];
  childrenOfSelected: ChildChip[];
  selected: CategoryFilterSelection;
  onSelect: (next: CategoryFilterSelection) => void;
};

const chipRowClass =
  "flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";

/**
 * 親子カテゴリフィルターチップ一覧。
 * 支出一覧・カレンダー画面で共通利用。
 * 親チップ選択中はその子チップ列を追加表示し、子選択でさらに絞り込む。
 */
export function CategoryFilterChips({ parents, childrenOfSelected, selected, onSelect }: Props) {
  if (parents.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className={chipRowClass}>
        <button
          onClick={() => onSelect({ parentId: null, childId: null })}
          className={cn(
            "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
            selected.parentId === null
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          すべて
        </button>
        {parents.map((parent) => (
          <button
            key={parent.id}
            onClick={() =>
              onSelect(
                selected.parentId === parent.id
                  ? { parentId: null, childId: null }
                  : { parentId: parent.id, childId: null }
              )
            }
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
              selected.parentId === parent.id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {parent.color && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: parent.color }}
              />
            )}
            {parent.name}
          </button>
        ))}
      </div>

      {selected.parentId !== null && childrenOfSelected.length > 0 && (
        <div className={chipRowClass}>
          <button
            onClick={() => onSelect({ parentId: selected.parentId, childId: null })}
            className={cn(
              "flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors",
              selected.childId === null
                ? "bg-foreground/80 text-background"
                : "bg-muted/70 text-muted-foreground hover:text-foreground"
            )}
          >
            すべて
          </button>
          {childrenOfSelected.map((child) => (
            <button
              key={child.id}
              onClick={() =>
                onSelect({
                  parentId: selected.parentId,
                  childId: selected.childId === child.id ? null : child.id,
                })
              }
              className={cn(
                "flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors",
                selected.childId === child.id
                  ? "bg-foreground/80 text-background"
                  : "bg-muted/70 text-muted-foreground hover:text-foreground"
              )}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
