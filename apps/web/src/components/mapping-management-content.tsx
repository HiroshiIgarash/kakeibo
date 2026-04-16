"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────
// GraphQL
// ────────────────────────────────────────────────────────────────
const MAPPINGS_QUERY = gql`
  query StoreMappingsManagement {
    storeMappings {
      id
      storeName
      categoryId
      category {
        id
        name
        color
      }
    }
    categories {
      id
      name
    }
  }
`;

const UPDATE_STORE_MAPPING = gql`
  mutation UpdateStoreMappingMutation($input: UpdateStoreMappingInput!) {
    updateStoreMapping(input: $input) {
      storeMapping {
        id
        storeName
        categoryId
        category {
          id
          name
          color
        }
      }
      errors
    }
  }
`;

const DELETE_STORE_MAPPING = gql`
  mutation DeleteStoreMappingMutation($input: DeleteStoreMappingInput!) {
    deleteStoreMapping(input: $input) {
      storeMapping {
        id
      }
      errors
    }
  }
`;

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
type StoreMapping = {
  id: string;
  storeName: string;
  categoryId: string;
  category: { id: string; name: string; color?: string | null };
};

type UpdateStoreMappingData = {
  updateStoreMapping: { storeMapping: StoreMapping | null; errors: string[] };
};

type DeleteStoreMappingData = {
  deleteStoreMapping: { storeMapping: { id: string } | null; errors: string[] };
};

type CategoryOption = { id: string; name: string };

// ────────────────────────────────────────────────────────────────
// 新規追加フォーム
// ────────────────────────────────────────────────────────────────
function AddMappingForm({
  categories,
  onDone,
}: {
  categories: CategoryOption[];
  onDone: () => void;
}) {
  const [storeName, setStoreName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const [upsert, { loading }] = useMutation<UpdateStoreMappingData>(UPDATE_STORE_MAPPING, {
    refetchQueries: [{ query: MAPPINGS_QUERY }],
    onCompleted(data) {
      const errors = data?.updateStoreMapping?.errors ?? [];
      if (errors.length > 0) {
        setError(errors.join(", "));
      } else {
        onDone();
      }
    },
    onError() { setError("保存に失敗しました"); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeName.trim()) { setError("店名を入力してください"); return; }
    if (!categoryId) { setError("カテゴリを選択してください"); return; }
    setError(null);
    upsert({ variables: { input: { storeName: storeName.trim(), categoryId } } });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 bg-muted/30 rounded-lg border border-border">
      <p className="text-sm font-medium">新規マッピング</p>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">店名（iPhoneショートカットの送信値と一致）</span>
        <input
          type="text"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="例：セブンイレブン"
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">カテゴリ</span>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
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
// マッピング行（編集・削除）
// ────────────────────────────────────────────────────────────────
function MappingRow({
  mapping,
  categories,
}: {
  mapping: StoreMapping;
  categories: CategoryOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [categoryId, setCategoryId] = useState(mapping.categoryId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [upsert, { loading: updating }] = useMutation<UpdateStoreMappingData>(UPDATE_STORE_MAPPING, {
    refetchQueries: [{ query: MAPPINGS_QUERY }],
    onCompleted(data) {
      const errors = data?.updateStoreMapping?.errors ?? [];
      if (errors.length > 0) {
        setError(errors.join(", "));
      } else {
        setEditing(false);
        setError(null);
      }
    },
    onError() { setError("保存に失敗しました"); },
  });

  const [remove, { loading: deleting }] = useMutation<DeleteStoreMappingData>(DELETE_STORE_MAPPING, {
    refetchQueries: [{ query: MAPPINGS_QUERY }],
    onError() { setError("削除に失敗しました"); },
  });

  if (editing) {
    return (
      <div className="flex flex-col gap-3 p-4 rounded-lg border border-primary/30 bg-muted/20">
        <p className="text-sm font-medium">{mapping.storeName}</p>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">カテゴリ</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setEditing(false); setError(null); setCategoryId(mapping.categoryId); }}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={updating}
            onClick={() => upsert({ variables: { input: { storeName: mapping.storeName, categoryId } } })}
          >
            {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: mapping.category.color ?? "#6b7280" }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-card-foreground truncate">{mapping.storeName}</p>
        <p className="text-xs text-muted-foreground">{mapping.category.name}</p>
      </div>
      {confirmDelete ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-500">削除しますか？</span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => remove({ variables: { input: { id: mapping.id } } })}
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="h-7 w-7 p-0"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            className={cn("h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50")}
          >
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
type Props = {
  initialMappings: StoreMapping[];
  initialCategories: CategoryOption[];
};

export function MappingManagementContent({ initialMappings, initialCategories }: Props) {
  const [adding, setAdding] = useState(false);

  const { data } = useQuery<{ storeMappings: StoreMapping[]; categories: CategoryOption[] }>(
    MAPPINGS_QUERY,
    { fetchPolicy: "cache-and-network" }
  );

  const mappings = data?.storeMappings ?? initialMappings;
  const categories = data?.categories ?? initialCategories;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        店名とカテゴリの対応ルールを管理します。iPhoneショートカットから送信された店名がここで登録済みの場合、自動でカテゴリが割り当てられます。
      </p>

      <div className="flex justify-end">
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4 mr-1" />
            マッピングを追加
          </Button>
        )}
      </div>

      {adding && (
        <AddMappingForm categories={categories} onDone={() => setAdding(false)} />
      )}

      <div className="flex flex-col gap-2">
        {mappings.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground text-center">
              マッピングがありません。追加ボタンから登録してください。
            </CardContent>
          </Card>
        ) : (
          mappings.map((m) => (
            <MappingRow key={m.id} mapping={m} categories={categories} />
          ))
        )}
      </div>
    </div>
  );
}
