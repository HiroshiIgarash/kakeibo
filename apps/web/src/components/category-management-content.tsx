"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCategory, updateCategory, deleteCategory } from "@/actions/categories";
import { buildCategoryTree, type CategoryNode } from "@/lib/category-tree";
import type { CategoryView } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────
// 定数
// ────────────────────────────────────────────────────────────────
const CATEGORY_TYPES: { value: "fixed" | "variable"; label: string }[] = [
  { value: "fixed", label: "固定費" },
  { value: "variable", label: "変動費" },
];

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#84cc16",
];

// ────────────────────────────────────────────────────────────────
// 新規追加フォーム（親カテゴリ）
// ────────────────────────────────────────────────────────────────
function AddCategoryForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"fixed" | "variable">("variable");
  const [color, setColor] = useState(PRESET_COLORS[4]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("カテゴリ名を入力してください"); return; }
    setError(null);
    setLoading(true);
    const result = await createCategory({ name: name.trim(), kind, color });
    setLoading(false);
    if (result.errors.length > 0) { setError(result.errors.join(", ")); return; }
    router.refresh();
    onDone();
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
              onClick={() => setKind(t.value)}
              className={cn(
                "flex-1 py-1.5 text-xs rounded-md border transition-colors",
                kind === t.value
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
// 子カテゴリ追加フォーム（インライン・名前のみ）
// ────────────────────────────────────────────────────────────────
function AddChildForm({ parentId, onDone }: { parentId: string; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("カテゴリ名を入力してください"); return; }
    setError(null);
    setLoading(true);
    const result = await createCategory({ name: name.trim(), parentId });
    setLoading(false);
    if (result.errors.length > 0) { setError(result.errors.join(", ")); return; }
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 pl-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="子カテゴリ名"
          className="flex-1 min-w-0 rounded-md border border-input bg-background px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        <Button type="button" variant="ghost" size="sm" onClick={onDone} className="h-7 w-7 p-0">
          <X className="w-3.5 h-3.5" />
        </Button>
        <Button type="submit" size="sm" disabled={loading} className="h-7 w-7 p-0">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  );
}

// ────────────────────────────────────────────────────────────────
// 子カテゴリ行（名前のみ・編集/削除）
// ────────────────────────────────────────────────────────────────
function ChildRow({ child }: { child: { id: string; name: string } }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(child.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("カテゴリ名を入力してください"); return; }
    setError(null);
    setUpdating(true);
    const result = await updateCategory({ id: child.id, name: name.trim(), color: null });
    setUpdating(false);
    if (result.errors.length > 0) { setError(result.errors.join(", ")); return; }
    setEditing(false);
    router.refresh();
  }

  async function handleRemove() {
    setDeleting(true);
    const result = await deleteCategory({ id: child.id });
    setDeleting(false);
    if (result.errors.length > 0) { setError(result.errors.join(", ")); return; }
    router.refresh();
  }

  if (editing) {
    return (
      <form onSubmit={handleUpdate} className="flex flex-col gap-1 pl-4 py-1">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-0 rounded-md border border-input bg-background px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setEditing(false); setError(null); setName(child.name); }}
            className="h-7 w-7 p-0"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
          <Button type="submit" size="sm" disabled={updating} className="h-7 w-7 p-0">
            {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </Button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1 pl-4 py-1">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 text-sm text-card-foreground truncate">{child.name}</span>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-500">削除しますか？</span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={deleting}
              className="h-7 px-2"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "削除"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} className="h-7 w-7 p-0">
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
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 親カテゴリカード（名前・色 + 子カテゴリ一覧 + 子追加）
// ────────────────────────────────────────────────────────────────
function ParentCard({ node }: { node: CategoryNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);
  const [color, setColor] = useState(node.color ?? PRESET_COLORS[4]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("カテゴリ名を入力してください"); return; }
    setError(null);
    setUpdating(true);
    const result = await updateCategory({ id: node.id, name: name.trim(), color });
    setUpdating(false);
    if (result.errors.length > 0) { setError(result.errors.join(", ")); return; }
    setEditing(false);
    router.refresh();
  }

  async function handleRemove() {
    setDeleting(true);
    const result = await deleteCategory({ id: node.id });
    setDeleting(false);
    if (result.errors.length > 0) { setError(result.errors.join(", ")); setConfirmDelete(false); return; }
    router.refresh();
  }

  const typeLabel = node.kind === "fixed" ? "固定費" : "変動費";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {editing ? (
          <form onSubmit={handleUpdate} className="flex flex-col gap-3 p-2 rounded-lg border border-primary/30 bg-muted/20">
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setEditing(false); setError(null); setName(node.name); setColor(node.color ?? PRESET_COLORS[4]); }}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button type="submit" size="sm" disabled={updating}>
                {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: node.color ?? "#6b7280" }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-card-foreground truncate">{node.name}</p>
              <p className="text-xs text-muted-foreground">{typeLabel}</p>
            </div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-500">子カテゴリもまとめて削除されます。削除しますか？</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleRemove}
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
        )}
        {error && !editing && <p className="text-xs text-red-500">{error}</p>}

        {node.children.length > 0 && (
          <div className="flex flex-col divide-y divide-border/50 border-t border-border/50 pt-1">
            {node.children.map((child) => (
              <ChildRow key={child.id} child={child} />
            ))}
          </div>
        )}

        {addingChild ? (
          <AddChildForm parentId={node.id} onDone={() => setAddingChild(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAddingChild(true)}
            className="flex items-center gap-1 self-start pl-4 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-3 h-3" />
            子カテゴリを追加
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────────────
export function CategoryManagementContent({ initialCategories }: { initialCategories: CategoryView[] }) {
  const [adding, setAdding] = useState(false);
  const tree = buildCategoryTree(initialCategories); // RSC が revalidate 後の最新を渡す
  const variable = tree.filter((n) => n.kind === "variable");
  const fixed = tree.filter((n) => n.kind === "fixed");

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
            <Card><CardContent className="text-sm text-muted-foreground">カテゴリがありません</CardContent></Card>
          ) : (
            variable.map((node) => <ParentCard key={node.id} node={node} />)
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
            <Card><CardContent className="text-sm text-muted-foreground">カテゴリがありません</CardContent></Card>
          ) : (
            fixed.map((node) => <ParentCard key={node.id} node={node} />)
          )}
        </div>
      </section>
    </div>
  );
}
