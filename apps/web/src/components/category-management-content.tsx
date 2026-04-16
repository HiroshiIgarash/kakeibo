"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────
// GraphQL
// ────────────────────────────────────────────────────────────────
const CATEGORIES_QUERY = gql`
  query CategoriesManagement {
    categories {
      id
      name
      categoryType
      color
      children {
        id
        name
        categoryType
        color
      }
    }
  }
`;

const CREATE_CATEGORY = gql`
  mutation CreateCategoryMutation($input: CreateCategoryInput!) {
    createCategory(input: $input) {
      category {
        id
        name
        categoryType
        color
      }
      errors
    }
  }
`;

const UPDATE_CATEGORY = gql`
  mutation UpdateCategoryMutation($input: UpdateCategoryInput!) {
    updateCategory(input: $input) {
      category {
        id
        name
        color
      }
      errors
    }
  }
`;

const DELETE_CATEGORY = gql`
  mutation DeleteCategoryMutation($input: DeleteCategoryInput!) {
    deleteCategory(input: $input) {
      category {
        id
      }
      errors
    }
  }
`;

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
type Category = {
  id: string;
  name: string;
  categoryType: string;
  color?: string | null;
  children: Category[];
};

type CreateCategoryData = {
  createCategory: { category: Category | null; errors: string[] };
};

type UpdateCategoryData = {
  updateCategory: { category: Category | null; errors: string[] };
};

type DeleteCategoryData = {
  deleteCategory: { category: { id: string } | null; errors: string[] };
};

const CATEGORY_TYPES = [
  { value: "FixedCategory", label: "固定費" },
  { value: "VariableCategory", label: "変動費" },
];

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#84cc16",
];

// ────────────────────────────────────────────────────────────────
// 新規追加フォーム
// ────────────────────────────────────────────────────────────────
function AddCategoryForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [categoryType, setCategoryType] = useState("VariableCategory");
  const [color, setColor] = useState(PRESET_COLORS[4]);
  const [error, setError] = useState<string | null>(null);

  const [create, { loading }] = useMutation<CreateCategoryData>(CREATE_CATEGORY, {
    refetchQueries: [{ query: CATEGORIES_QUERY }],
    onCompleted(data) {
      const errors = data?.createCategory?.errors ?? [];
      if (errors.length > 0) {
        setError(errors.join(", "));
      } else {
        onDone();
      }
    },
    onError() {
      setError("保存に失敗しました");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("カテゴリ名を入力してください"); return; }
    setError(null);
    create({ variables: { input: { name: name.trim(), categoryType, color } } });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 bg-muted/30 rounded-lg border border-border">
      <p className="text-sm font-medium">新規カテゴリ</p>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">カテゴリ名</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：食費"
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">種別</span>
        <div className="flex gap-2">
          {CATEGORY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setCategoryType(t.value)}
              className={cn(
                "flex-1 py-1.5 text-xs rounded-md border transition-colors",
                categoryType === t.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">色</span>
        <div className="flex gap-2 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                "w-6 h-6 rounded-full border-2 transition-all",
                color === c ? "border-foreground scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          キャンセル
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "追加"}
        </Button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────────
// カテゴリ行（編集・削除）
// ────────────────────────────────────────────────────────────────
function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color ?? PRESET_COLORS[4]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [update, { loading: updating }] = useMutation<UpdateCategoryData>(UPDATE_CATEGORY, {
    refetchQueries: [{ query: CATEGORIES_QUERY }],
    onCompleted(data) {
      const errors = data?.updateCategory?.errors ?? [];
      if (errors.length > 0) {
        setError(errors.join(", "));
      } else {
        setEditing(false);
        setError(null);
      }
    },
    onError() { setError("保存に失敗しました"); },
  });

  const [remove, { loading: deleting }] = useMutation<DeleteCategoryData>(DELETE_CATEGORY, {
    refetchQueries: [{ query: CATEGORIES_QUERY }],
    onError() { setError("削除に失敗しました"); },
  });

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("カテゴリ名を入力してください"); return; }
    setError(null);
    update({ variables: { input: { id: category.id, name: name.trim(), color } } });
  }

  const typeLabel = category.categoryType === "FixedCategory" ? "固定費" : "変動費";

  if (editing) {
    return (
      <form onSubmit={handleUpdate} className="flex flex-col gap-3 p-4 rounded-lg border border-primary/30 bg-muted/20">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">カテゴリ名</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">色</span>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-all",
                  color === c ? "border-foreground scale-110" : "border-transparent"
                )}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setError(null); setName(category.name); setColor(category.color ?? PRESET_COLORS[4]); }}>
            <X className="w-3.5 h-3.5" />
          </Button>
          <Button type="submit" size="sm" disabled={updating}>
            {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: category.color ?? "#6b7280" }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-card-foreground truncate">{category.name}</p>
        <p className="text-xs text-muted-foreground">{typeLabel}</p>
      </div>
      {confirmDelete ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-500">削除しますか？</span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => remove({ variables: { input: { id: category.id } } })}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "削除"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-7 w-7 p-0">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────────────
type InitialCategory = {
  id: string;
  name: string;
  categoryType: string;
  color?: string | null;
  children: InitialCategory[];
};

export function CategoryManagementContent({
  initialCategories,
}: {
  initialCategories: InitialCategory[];
}) {
  const [adding, setAdding] = useState(false);

  // クライアントサイドで最新データを取得（Server側で初期データ取得済み）
  const { data } = useQuery<{ categories: Category[] }>(CATEGORIES_QUERY, {
    fetchPolicy: "cache-and-network",
  });

  const categories: Category[] = data?.categories ?? initialCategories;

  // GraphQL クエリが root カテゴリのみを返すため、そのまま分類する
  const fixed = categories.filter((c) => c.categoryType === "FixedCategory");
  const variable = categories.filter((c) => c.categoryType === "VariableCategory");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4 mr-1" />
            カテゴリを追加
          </Button>
        )}
      </div>

      {adding && <AddCategoryForm onDone={() => setAdding(false)} />}

      {/* 変動費 */}
      <section>
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          変動費
        </h2>
        <div className="flex flex-col gap-2">
          {variable.length === 0 ? (
            <Card><CardContent className="p-4 text-sm text-muted-foreground">カテゴリがありません</CardContent></Card>
          ) : (
            variable.map((cat) => <CategoryRow key={cat.id} category={cat} />)
          )}
        </div>
      </section>

      {/* 固定費 */}
      <section>
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          固定費
        </h2>
        <div className="flex flex-col gap-2">
          {fixed.length === 0 ? (
            <Card><CardContent className="p-4 text-sm text-muted-foreground">カテゴリがありません</CardContent></Card>
          ) : (
            fixed.map((cat) => <CategoryRow key={cat.id} category={cat} />)
          )}
        </div>
      </section>
    </div>
  );
}
