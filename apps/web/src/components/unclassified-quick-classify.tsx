"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertStoreMapping } from "@/actions/mappings";
import { createCategory } from "@/actions/categories";
import type { UnclassifiedGroup, CategoryOption } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Loader2, Plus, Tag } from "lucide-react";

// ────────────────────────────────────────────────────────────────
// カテゴリ選択パネル（新規カテゴリ作成込み）
// ────────────────────────────────────────────────────────────────
function CategoryPicker({
  categories,
  onPick,
  busy,
}: {
  categories: CategoryOption[];
  onPick: (categoryId: string) => void;
  busy: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"variable" | "fixed">("variable");
  const [error, setError] = useState<string | null>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setError("カテゴリ名を入力してください");
      return;
    }
    setError(null);
    setCreatingBusy(true);
    const result = await createCategory({ name, kind: newKind, color: null });
    setCreatingBusy(false);
    if (result.errors.length > 0 || !result.id) {
      setError(result.errors.join(", ") || "カテゴリの作成に失敗しました");
      return;
    }
    // 作成したカテゴリでそのまま分類を続行する
    onPick(result.id);
  }

  return (
    <div className="flex flex-col gap-2 pt-2">
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={busy}
            onClick={() => onPick(c.id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: c.color ?? "#6b7280" }}
            />
            {c.name}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
          新しいカテゴリ
        </button>
      </div>

      {creating && (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/30 border border-border">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="カテゴリ名（例：食費）"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(["variable", "fixed"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setNewKind(k)}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                    newKind === k
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {k === "variable" ? "変動費" : "固定費"}
                </button>
              ))}
            </div>
            <Button type="button" size="sm" disabled={creatingBusy || busy} onClick={handleCreate}>
              {creatingBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "作成して分類"}
            </Button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 未分類グループ行
// ────────────────────────────────────────────────────────────────
function GroupRow({
  group,
  categories,
  open,
  onToggle,
}: {
  group: UnclassifiedGroup;
  categories: CategoryOption[];
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
      {open && <CategoryPicker categories={categories} onPick={handlePick} busy={busy} />}
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
};

export function UnclassifiedQuickClassify({ groups, categories }: Props) {
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
            open={openStore === g.storeName}
            onToggle={() => setOpenStore((v) => (v === g.storeName ? null : g.storeName))}
          />
        ))}
      </CardContent>
    </Card>
  );
}
