"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertStoreMapping } from "@/actions/mappings";
import { createCategory, createCategoryWithParent } from "@/actions/categories";
import { PRESET_COLORS, pickUnusedColor } from "@/lib/category-colors";
import type { UnclassifiedGroup, CategoryOption, ParentCategoryOption } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Loader2, Plus, Tag } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** 子カテゴリ一覧を親名でグルーピングする（挿入順 = loader のソート順を保持） */
function groupByParent(categories: CategoryOption[]): Map<string, CategoryOption[]> {
  const grouped = new Map<string, CategoryOption[]>();
  for (const cat of categories) {
    const list = grouped.get(cat.parentName);
    if (list) {
      list.push(cat);
    } else {
      grouped.set(cat.parentName, [cat]);
    }
  }
  return grouped;
}

// ────────────────────────────────────────────────────────────────
// カテゴリ選択パネル（新規カテゴリ作成込み）
// ────────────────────────────────────────────────────────────────
const NEW_PARENT_VALUE = "__new__";

const KIND_OPTIONS: { value: "fixed" | "variable"; label: string }[] = [
  { value: "variable", label: "変動費" },
  { value: "fixed", label: "固定費" },
];

function CategoryPicker({
  categories,
  parentOptions,
  onPick,
  busy,
}: {
  categories: CategoryOption[];
  parentOptions: ParentCategoryOption[];
  onPick: (categoryId: string) => void;
  busy: boolean;
}) {
  const hasParents = parentOptions.length > 0;
  // 親カテゴリが1つもなければ、最初から新規親モードでフォームを開く
  const [creating, setCreating] = useState(!hasParents);
  const [parentValue, setParentValue] = useState(hasParents ? parentOptions[0].id : NEW_PARENT_VALUE);
  const [newParentName, setNewParentName] = useState("");
  const [newKind, setNewKind] = useState<"fixed" | "variable">("variable");
  const [newColor, setNewColor] = useState(() => pickUnusedColor(parentOptions.map((p) => p.color)));
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);

  const isNewParent = parentValue === NEW_PARENT_VALUE;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setError("カテゴリ名を入力してください");
      return;
    }
    const parentName = newParentName.trim();
    if (isNewParent && !parentName) {
      setError("親カテゴリ名を入力してください");
      return;
    }
    setError(null);
    setCreatingBusy(true);
    const result = isNewParent
      ? await createCategoryWithParent({ parentName, kind: newKind, color: newColor, childName: name })
      : await createCategory({ name, parentId: parentValue });
    setCreatingBusy(false);
    if (result.errors.length > 0 || !result.id) {
      setError(result.errors.join(", ") || "カテゴリの作成に失敗しました");
      return;
    }
    // 作成したカテゴリでそのまま分類を続行する
    onPick(result.id);
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      {Array.from(groupByParent(categories)).map(([parentName, children]) => (
        <div key={parentName} className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            {parentName}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => onPick(c.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-transparent px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: c.color ?? "#6b7280" }}
                />
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div>
        <button
          type="button"
          disabled={busy}
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
          新しいカテゴリ
        </button>

        {creating && (
          <div className="flex flex-col gap-2 p-3 mt-2 rounded-lg bg-muted/30 border border-border">
            <NativeSelect
              value={parentValue}
              onChange={(e) => setParentValue(e.target.value)}
            >
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              <option value={NEW_PARENT_VALUE}>＋新しい親カテゴリ</option>
            </NativeSelect>

            {isNewParent && (
              <>
                <Input
                  type="text"
                  value={newParentName}
                  onChange={(e) => setNewParentName(e.target.value)}
                  placeholder="親カテゴリ名（例：食費）"
                />
                <div className="flex gap-2">
                  {KIND_OPTIONS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setNewKind(t.value)}
                      className={cn(
                        "flex-1 py-1.5 text-xs rounded-md border transition-colors",
                        newKind === t.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 transition-all",
                        newColor === c ? "border-foreground scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </>
            )}

            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="カテゴリ名（例：外食）"
              autoFocus
            />
            <div className="flex justify-end">
              <Button type="button" size="sm" disabled={creatingBusy || busy} onClick={handleCreate}>
                {creatingBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "作成して分類"}
              </Button>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 未分類グループ行
// ────────────────────────────────────────────────────────────────
function GroupRow({
  group,
  categories,
  parentOptions,
  open,
  onToggle,
}: {
  group: UnclassifiedGroup;
  categories: CategoryOption[];
  parentOptions: ParentCategoryOption[];
  open: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(categoryId: string) {
    setError(null);
    setBusy(true);
    // マッピング登録 + 同一店名の未分類取引を一括再分類（既存actionの挙動）
    const result = await upsertStoreMapping({ storeName: group.storeName, categoryId });
    setBusy(false);
    if (result.errors.length > 0) {
      setError(result.errors.join(", "));
      return;
    }
    router.refresh();
  }

  return (
    <div className="px-4 py-3">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-card-foreground truncate">{group.storeName}</p>
          <p className="text-xs text-muted-foreground">
            {group.count}件 / ¥{group.totalAmount.toLocaleString()}
          </p>
        </div>
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <CategoryPicker
          categories={categories}
          parentOptions={parentOptions}
          onPick={handlePick}
          busy={busy}
        />
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────────────
type Props = {
  groups: UnclassifiedGroup[];
  categories: CategoryOption[];
  parentOptions: ParentCategoryOption[];
};

export function UnclassifiedQuickClassify({ groups, categories, parentOptions }: Props) {
  const [openStore, setOpenStore] = useState<string | null>(null);
  if (groups.length === 0) return null;

  const totalCount = groups.reduce((acc, g) => acc + g.count, 0);

  return (
    <Card className="py-0 gap-0 border-amber-300/60">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Tag className="w-4 h-4 text-amber-600" />
        <p className="text-sm font-semibold text-card-foreground">未分類の取引</p>
        <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
          {totalCount}件
        </span>
      </div>
      <p className="px-4 pt-3 text-xs text-muted-foreground">
        店名をタップしてカテゴリを選ぶと、同じ店の取引がまとめて分類され、以後の取り込みも自動分類されます。
      </p>
      <CardContent className="p-0 divide-y divide-border">
        {groups.map((g) => (
          <GroupRow
            key={g.storeName}
            group={g}
            categories={categories}
            parentOptions={parentOptions}
            open={openStore === g.storeName}
            onToggle={() => setOpenStore((v) => (v === g.storeName ? null : g.storeName))}
          />
        ))}
      </CardContent>
    </Card>
  );
}
