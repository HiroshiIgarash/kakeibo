# TOP 未分類パネル 親カテゴリインライン作成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TOP の未分類分類パネル内で親カテゴリ＋子カテゴリを一括作成し、設定ページへ移動せずに分類を完了できるようにする。

**Architecture:** 色プリセットを `src/lib/category-colors.ts` に抽出（純粋ロジック＋ユニットテスト）。新 Server Action `createCategoryWithParent` が単一 DB トランザクションで親→子を作成。`CategoryPicker`（`unclassified-quick-classify.tsx`）の親セレクトに `＋新しい親カテゴリ` option を追加し、選択時に親名・種別・色の入力欄を展開する。

**Tech Stack:** Next.js 16 (App Router / Server Actions), Drizzle ORM, zod v4, Vitest + @electric-sql/pglite

**Spec:** `docs/superpowers/specs/2026-07-11-inline-parent-category-creation-design.md`

## Global Constraints

- 作業ディレクトリ: リポジトリルート `/Users/hiroshi/Desktop/work/rails/kakeibo`。アプリは `apps/web`
- テスト実行: `pnpm -C apps/web test <path>`（vitest run）
- コミット: Conventional Commits 形式、末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- TDD: 各タスク テスト先行、Red 確認 → 実装 → Green 確認
- カテゴリは 2 階層固定。子は親の `kind` を継承、子の `color` は常に null（親の色を表示に使う）
- UI 文言は日本語。既存コンポーネントのスタイル（Tailwind クラス・トーン）を踏襲

---

### Task 1: 色プリセット共通化 `src/lib/category-colors.ts`

**Files:**
- Create: `apps/web/src/lib/category-colors.ts`
- Create: `apps/web/src/lib/category-colors.test.ts`
- Modify: `apps/web/src/components/category-management-content.tsx:22-26`（ローカル `PRESET_COLORS` を削除して import に置換）

**Interfaces:**
- Consumes: なし
- Produces:
  - `export const PRESET_COLORS: string[]`（10 色、既存 `category-management-content.tsx` の値をそのまま移動）
  - `export function pickUnusedColor(usedColors: (string | null)[]): string`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/category-colors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PRESET_COLORS, pickUnusedColor } from "./category-colors";

describe("PRESET_COLORS", () => {
  it("10色のプリセットを持つ", () => {
    expect(PRESET_COLORS).toHaveLength(10);
  });
});

describe("pickUnusedColor", () => {
  it("使用済みなしなら先頭色を返す", () => {
    expect(pickUnusedColor([])).toBe(PRESET_COLORS[0]);
  });

  it("使用済みを飛ばして最初の未使用色を返す", () => {
    expect(pickUnusedColor([PRESET_COLORS[0], PRESET_COLORS[1]])).toBe(PRESET_COLORS[2]);
  });

  it("順不同の使用済みでも正しく判定する", () => {
    expect(pickUnusedColor([PRESET_COLORS[1]])).toBe(PRESET_COLORS[0]);
  });

  it("全色使用済みなら先頭色を返す", () => {
    expect(pickUnusedColor([...PRESET_COLORS])).toBe(PRESET_COLORS[0]);
  });

  it("null（色未設定の親）は無視する", () => {
    expect(pickUnusedColor([null, PRESET_COLORS[0]])).toBe(PRESET_COLORS[1]);
  });

  it("プリセット外の色は判定に影響しない", () => {
    expect(pickUnusedColor(["#000000"])).toBe(PRESET_COLORS[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test src/lib/category-colors.test.ts`
Expected: FAIL（`Failed to load ./category-colors` — モジュール未作成）

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/category-colors.ts`:

```ts
/** 親カテゴリの色プリセット（設定画面・TOP 分類パネルで共用） */
export const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#84cc16",
];

/** 既存親カテゴリが未使用のプリセット色を返す。全色使用済みなら先頭色。 */
export function pickUnusedColor(usedColors: (string | null)[]): string {
  const used = new Set(usedColors.filter((c): c is string => c != null));
  return PRESET_COLORS.find((c) => !used.has(c)) ?? PRESET_COLORS[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test src/lib/category-colors.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: 設定画面のローカル定義を import に置換**

`apps/web/src/components/category-management-content.tsx` の

```ts
const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#84cc16",
];
```

を削除し、ファイル先頭の import 群に追加:

```ts
import { PRESET_COLORS } from "@/lib/category-colors";
```

- [ ] **Step 6: 全テスト＋lint で回帰確認**

Run: `pnpm -C apps/web test && pnpm -C apps/web lint`
Expected: 全 PASS / lint エラーなし

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/category-colors.ts apps/web/src/lib/category-colors.test.ts apps/web/src/components/category-management-content.tsx
git commit -m "refactor(web): extract category color presets to shared module

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Server Action `createCategoryWithParent`

**Files:**
- Modify: `apps/web/src/actions/categories.ts`（`createCategory` の直後に追加）
- Modify: `apps/web/src/actions/categories.test.ts`（describe ブロック追加）

**Interfaces:**
- Consumes: `categories` スキーマ（`@/db/schema`）、`ActionResult` 型、`kindEnum`（同ファイル既存）
- Produces:
  ```ts
  export async function createCategoryWithParent(input: {
    parentName: string;
    kind: "fixed" | "variable";
    color?: string | null;
    childName: string;
  }): Promise<ActionResult & { id?: string }>  // id = 作成された「子」の id（文字列）
  ```

- [ ] **Step 1: Write the failing tests**

`apps/web/src/actions/categories.test.ts` の import 行を修正:

```ts
const { createCategory, updateCategory, deleteCategory, createCategoryWithParent } = await import("./categories");
```

ファイル末尾に describe を追加:

```ts
describe("createCategoryWithParent", () => {
  it("親と子を一括作成し、子のidを文字列で返す", async () => {
    const res = await createCategoryWithParent({
      parentName: "食費",
      kind: "variable",
      color: "#3b82f6",
      childName: "外食",
    });
    expect(res.errors).toEqual([]);
    const rows = await testDb.select().from(categories);
    expect(rows).toHaveLength(2);
    const parent = rows.find((r) => r.parentId === null)!;
    const child = rows.find((r) => r.parentId === parent.id)!;
    expect(parent).toMatchObject({ name: "食費", kind: "variable", color: "#3b82f6" });
    expect(child).toMatchObject({ name: "外食", kind: "variable", color: null });
    expect(res.id).toBe(String(child.id));
  });

  it("kind 'fixed' は子にも継承される", async () => {
    const res = await createCategoryWithParent({ parentName: "住居", kind: "fixed", childName: "家賃" });
    expect(res.errors).toEqual([]);
    const rows = await testDb.select().from(categories);
    expect(rows.map((r) => r.kind)).toEqual(["fixed", "fixed"]);
  });

  it("color 未指定なら親の color は null", async () => {
    const res = await createCategoryWithParent({ parentName: "食費", kind: "variable", childName: "外食" });
    expect(res.errors).toEqual([]);
    const rows = await testDb.select().from(categories);
    const parent = rows.find((r) => r.parentId === null)!;
    expect(parent.color).toBeNull();
  });

  it("親名空欄は拒否・DB変更なし", async () => {
    const res = await createCategoryWithParent({ parentName: "  ", kind: "variable", childName: "外食" });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(categories)).toHaveLength(0);
  });

  it("子名空欄は拒否・DB変更なし", async () => {
    const res = await createCategoryWithParent({ parentName: "食費", kind: "variable", childName: "  " });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(categories)).toHaveLength(0);
  });

  it("不正な kind は拒否・DB変更なし", async () => {
    const res = await createCategoryWithParent({
      parentName: "食費",
      kind: "weekly" as never,
      childName: "外食",
    });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(categories)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web test src/actions/categories.test.ts`
Expected: FAIL（`createCategoryWithParent is not a function`）

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/actions/categories.ts` — `createSchema` 群の下にスキーマ追加:

```ts
const createWithParentSchema = z.object({
  parentName: z.string().trim().min(1, "親カテゴリ名を入力してください"),
  kind: kindEnum,
  color: z.union([z.string(), z.null()]).optional(),
  childName: z.string().trim().min(1, "カテゴリ名を入力してください"),
});
```

`createCategory` の直後に関数追加:

```ts
// TOP 未分類パネル用: 親＋子を単一トランザクションで一括作成し、子の id を返す。
// createCategory を2回呼ぶ方式にしない（子の作成失敗時に孤児親を残さないため）。
export async function createCategoryWithParent(input: {
  parentName: string;
  kind: "fixed" | "variable";
  color?: string | null;
  childName: string;
}): Promise<ActionResult & { id?: string }> {
  const parsed = createWithParentSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { parentName, kind, color, childName } = parsed.data;

  const childId = await db.transaction(async (tx) => {
    const [parent] = await tx
      .insert(categories)
      .values({ name: parentName, kind, color: color ?? null, parentId: null })
      .returning({ id: categories.id });
    const [child] = await tx
      .insert(categories)
      .values({ name: childName, kind, color: null, parentId: parent.id })
      .returning({ id: categories.id });
    return child.id;
  });

  revalidatePath("/settings/categories");
  revalidatePath("/");
  return { errors: [], id: String(childId) };
}
```

備考（原子性の担保）: バリデーションは insert 前に完結し、categories に unique 制約もないため、
「子 insert のみ失敗」を実入力で再現する経路がない。原子性は `db.transaction` の構造で担保し、
統合テストは入力バリデーション失敗時に DB 変更ゼロであることを検証する（上記テスト）。

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web test src/actions/categories.test.ts`
Expected: PASS（既存含め全 green）

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/actions/categories.ts apps/web/src/actions/categories.test.ts
git commit -m "feat(web): add createCategoryWithParent server action

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `CategoryPicker` に新規親カテゴリ作成 UI

**Files:**
- Modify: `apps/web/src/components/unclassified-quick-classify.tsx`（`CategoryPicker` を全面差し替え）

**Interfaces:**
- Consumes:
  - `createCategoryWithParent`（Task 2 のシグネチャ）
  - `PRESET_COLORS` / `pickUnusedColor(usedColors: (string | null)[]): string`（Task 1）
  - `ParentCategoryOption = { id: string; name: string; color: string | null }`（既存 `@/lib/queries`）
- Produces: なし（末端 UI）

- [ ] **Step 1: `CategoryPicker` を差し替え**

`apps/web/src/components/unclassified-quick-classify.tsx` — import 追加:

```ts
import { createCategory, createCategoryWithParent } from "@/actions/categories";
import { PRESET_COLORS, pickUnusedColor } from "@/lib/category-colors";
import { cn } from "@/lib/utils";
```

`CategoryPicker` 関数（現在の 29〜142 行）を以下に置換:

```tsx
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
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
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
            <select
              value={parentValue}
              onChange={(e) => setParentValue(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              <option value={NEW_PARENT_VALUE}>＋新しい親カテゴリ</option>
            </select>

            {isNewParent && (
              <>
                <input
                  type="text"
                  value={newParentName}
                  onChange={(e) => setNewParentName(e.target.value)}
                  placeholder="親カテゴリ名（例：食費）"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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

            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="カテゴリ名（例：外食）"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
```

変更点の要約（レビュー観点）:
- 「先に設定画面で親カテゴリを作成してください」分岐を削除。親ゼロ時は `creating` 初期値 true ＋ セレクトが `＋新しい親カテゴリ` のみ
- 親セレクト末尾に `＋新しい親カテゴリ`（`"__new__"`）を追加し、選択時のみ親名・種別・色を展開
- 色は `pickUnusedColor` で未使用色を初期選択、スウォッチで変更可
- 既存親選択時の挙動（`createCategory` → `onPick`）は不変

- [ ] **Step 2: 全テスト・lint・build で検証**

Run: `pnpm -C apps/web test && pnpm -C apps/web lint && pnpm -C apps/web build`
Expected: 全 PASS / lint・型エラーなし / build 成功

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/unclassified-quick-classify.tsx
git commit -m "feat(web): create parent category inline from unclassified panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 手動確認（実装完了後）

`pnpm -C apps/web dev` で起動し TOP を確認:
1. 未分類グループを開く → 「新しいカテゴリ」→ 親セレクト末尾に `＋新しい親カテゴリ` がある
2. 選択すると親名・種別（変動費が初期選択）・色（未使用色が初期選択）が展開される
3. 親名「日用品」＋子名「消耗品」で「作成して分類」→ 分類完了、チップに新カテゴリが出る
4. 設定 → カテゴリ管理に「日用品」（指定色）＋子「消耗品」が存在する
5. 既存親の下への子作成（従来フロー）が壊れていない
