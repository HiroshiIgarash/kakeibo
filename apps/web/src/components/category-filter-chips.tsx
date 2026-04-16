"use client";

import { cn } from "@/lib/utils";

type Category = {
  id: string;
  name: string;
  color?: string | null;
};

type Props = {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelect: (id: string | null) => void;
};

/**
 * カテゴリフィルターチップ一覧。
 * 支出一覧・カレンダー画面で共通利用。
 */
export function CategoryFilterChips({ categories, selectedCategoryId, onSelect }: Props) {
  if (categories.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
          selectedCategoryId === null
            ? "bg-foreground text-background"
            : "bg-muted text-muted-foreground hover:text-foreground"
        )}
      >
        すべて
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(selectedCategoryId === cat.id ? null : cat.id)}
          className={cn(
            "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
            selectedCategoryId === cat.id
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {cat.color && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: cat.color }}
            />
          )}
          {cat.name}
        </button>
      ))}
    </div>
  );
}
