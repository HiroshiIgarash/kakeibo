# カテゴリ2階層化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カテゴリを「親 > 子」の2階層にし、取引・店舗マッピングは子のみ、予算・アラートは親のみに割り当てる。

**Architecture:** `categories.parentId`（既存・自己参照FK）を使い、DDL変更なし。階層制約はServer Actionのアプリ層バリデーション + pgliteテストで担保。集計・アラートは「子の取引 → 親に解決」して親単位で判定。

**Tech Stack:** Next.js 16 / Drizzle ORM / zod / Vitest + pglite

**Spec:** `docs/superpowers/specs/2026-07-10-category-hierarchy-design.md`

## Global Constraints

- 親: `parentId = null`。`kind`・`color` は親が実質保持（子の kind は DB NOT NULL のため親の値をコピー）
- 子: `parentId` 必須。UI 上は name のみ編集。色・kind は親から継承表示
- 孫禁止（parentId に指定できるのは親カテゴリのみ）
- 取引・店舗マッピングの categoryId は子のみ / 予算・予算アラート設定・ペースアラート設定は親のみ
- budgetAlertSettings の全体設定（categoryId = null）は現状どおり許容
- 未分類（transactions.categoryId = null）は現状どおり許容
- テストは vitest。実行: `cd apps/web && npx vitest run <path>`
- コミットは Conventional Commits。各タスク末尾でコミット
- エラーメッセージは既存同様 `{ errors: string[] }` 形式の日本語

---

### Task 1: `src/lib/category-tree.ts` — ツリー構築・役割判定ヘルパー

**Files:**
- Create: `apps/web/src/lib/category-tree.ts`
- Test: `apps/web/src/lib/category-tree.test.ts`

**Interfaces:**
- Produces:
  - `type CategoryTreeRow = { id: string; name: string; kind: "fixed" | "variable"; color: string | null; sortOrder: number; parentId: string | null }`
  - `type CategoryNode = { id: string; name: string; kind: "fixed" | "variable"; color: string | null; children: { id: string; name: string }[] }`
  - `buildCategoryTree(rows: CategoryTreeRow[]): CategoryNode[]`（純粋関数。親を sortOrder→id 順、子を親内で sortOrder→id 順）
  - `getCategoryRole(db: Db, id: number): Promise<"parent" | "child" | null>`（存在しなければ null。parentId 有 = child）
  - `getAlertTargetCategoryIds(db: Db, parentId: number): Promise<number[]>`（親id + 全子idの配列。集計・アラートの spent 計算用）

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// apps/web/src/lib/category-tree.test.ts
import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createTestDb } from "@/test/db";
import { categories } from "@/db/schema";
import {
  buildCategoryTree,
  getCategoryRole,
  getAlertTargetCategoryIds,
  type CategoryTreeRow,
} from "./category-tree";

const { db, teardown } = await createTestDb();
afterAll(() => teardown());
beforeEach(async () => {
  await db.delete(categories);
});

describe("buildCategoryTree", () => {
  const row = (o: Partial<CategoryTreeRow>): CategoryTreeRow => ({
    id: "1",
    name: "x",
    kind: "variable",
    color: null,
    sortOrder: 0,
    parentId: null,
    ...o,
  });

  it("親をsortOrder順、子を親の下にsortOrder順で入れ子にする", () => {
    const tree = buildCategoryTree([
      row({ id: "10", name: "趣味", sortOrder: 2 }),
      row({ id: "1", name: "食費", sortOrder: 1, color: "#f00" }),
      row({ id: "12", name: "外出", parentId: "1", sortOrder: 2 }),
      row({ id: "11", name: "お菓子", parentId: "1", sortOrder: 1 }),
      row({ id: "13", name: "VTuber", parentId: "10", sortOrder: 1 }),
    ]);
    expect(tree).toEqual([
      {
        id: "1",
        name: "食費",
        kind: "variable",
        color: "#f00",
        children: [
          { id: "11", name: "お菓子" },
          { id: "12", name: "外出" },
        ],
      },
      { id: "10", name: "趣味", kind: "variable", color: null, children: [{ id: "13", name: "VTuber" }] },
    ]);
  });

  it("子がいない親は children: [] になる", () => {
    expect(buildCategoryTree([row({ id: "1", name: "日用品" })])).toEqual([
      { id: "1", name: "日用品", kind: "variable", color: null, children: [] },
    ]);
  });
});

describe("getCategoryRole", () => {
  it("親は 'parent'、子は 'child'、不存在は null", async () => {
    const [parent] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [child] = await db
      .insert(categories)
      .values({ name: "お菓子", kind: "variable", parentId: parent.id })
      .returning();
    expect(await getCategoryRole(db, parent.id)).toBe("parent");
    expect(await getCategoryRole(db, child.id)).toBe("child");
    expect(await getCategoryRole(db, 999999)).toBeNull();
  });
});

describe("getAlertTargetCategoryIds", () => {
  it("親idと全子idを返す", async () => {
    const [parent] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [c1] = await db.insert(categories).values({ name: "お菓子", kind: "variable", parentId: parent.id }).returning();
    const [c2] = await db.insert(categories).values({ name: "外出", kind: "variable", parentId: parent.id }).returning();
    const ids = await getAlertTargetCategoryIds(db, parent.id);
    expect(ids.sort((a, b) => a - b)).toEqual([parent.id, c1.id, c2.id].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `cd apps/web && npx vitest run src/lib/category-tree.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: 実装**

```typescript
// apps/web/src/lib/category-tree.ts
import { eq } from "drizzle-orm";
import type { Db } from "@/db/schema";
import { categories } from "@/db/schema";

export type CategoryTreeRow = {
  id: string;
  name: string;
  kind: "fixed" | "variable";
  color: string | null;
  sortOrder: number;
  parentId: string | null;
};

export type CategoryNode = {
  id: string;
  name: string;
  kind: "fixed" | "variable";
  color: string | null;
  children: { id: string; name: string }[];
};

/** フラット行を親（sortOrder→id順）＞子（同順）のツリーへ変換する純粋関数。client からも import 可 */
export function buildCategoryTree(rows: CategoryTreeRow[]): CategoryNode[] {
  const byOrder = (a: CategoryTreeRow, b: CategoryTreeRow) =>
    a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id);
  const parents = rows.filter((r) => r.parentId == null).sort(byOrder);
  return parents.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    color: p.color,
    children: rows
      .filter((r) => r.parentId === p.id)
      .sort(byOrder)
      .map((c) => ({ id: c.id, name: c.name })),
  }));
}

/** カテゴリの階層役割。割当先バリデーション（取引・マッピング=child / 予算・アラート=parent）に使う */
export async function getCategoryRole(db: Db, id: number): Promise<"parent" | "child" | null> {
  const row = (
    await db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, id)).limit(1)
  )[0];
  if (!row) return null;
  return row.parentId == null ? "parent" : "child";
}

/** 親配下の集計対象カテゴリid（親自身+全子）。予算・ペースの spent 集計はこの集合で行う */
export async function getAlertTargetCategoryIds(db: Db, parentId: number): Promise<number[]> {
  const children = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, parentId));
  return [parentId, ...children.map((c) => c.id)];
}
```

- [ ] **Step 4: テスト成功確認**

Run: `cd apps/web && npx vitest run src/lib/category-tree.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/category-tree.ts apps/web/src/lib/category-tree.test.ts
git commit -m "feat(web): add category tree helpers for two-level hierarchy"
```

---

### Task 2: queries.ts — 階層対応ローダー

**Files:**
- Modify: `apps/web/src/lib/queries.ts`
- Test: `apps/web/src/lib/queries.test.ts`（追記）

**Interfaces:**
- Consumes: なし（drizzle `alias` を使用: `import { alias } from "drizzle-orm/pg-core"`）
- Produces:
  - `CategoryRef` を `{ id, name, color, parentId: string | null, parentName: string | null }` に拡張（`TransactionView.category` に反映。color は「親があれば親の color、なければ自身の color」）
  - `CategoryView` に `parentId: string | null`・`sortOrder: number` を追加（= `CategoryTreeRow` 互換。`loadCategories` が返す）
  - `CategoryOption` を **子のみ** `{ id, name, color(親のcolor), parentId: string, parentName: string }` に変更（`loadCategoryOptions`）
  - 新規 `type ParentCategoryOption = { id: string; name: string; color: string | null }` / `loadParentCategoryOptions(db): Promise<ParentCategoryOption[]>`（親のみ、sortOrder→id順）
  - `loadBudgetSettingsView`: 親カテゴリのみ列挙に変更（それ以外のシグネチャ不変）

- [ ] **Step 1: 失敗するテストを追記**

`apps/web/src/lib/queries.test.ts` に追記（既存の createTestDb / beforeEach パターンに従う。既存テストで `loadCategoryOptions` が全カテゴリを返す前提のものがあれば「子のみ」を前提に修正する）:

```typescript
describe("階層ローダー", () => {
  it("loadCategoryOptions は子のみ返し、親名・親colorを同梱する", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", color: "#f00", sortOrder: 1 }).returning();
    await db.insert(categories).values({ name: "趣味", kind: "variable", sortOrder: 2 }); // 子なし親
    const [snack] = await db.insert(categories).values({ name: "お菓子", kind: "variable", parentId: food.id, sortOrder: 1 }).returning();
    const options = await loadCategoryOptions(db);
    expect(options).toEqual([
      { id: String(snack.id), name: "お菓子", color: "#f00", parentId: String(food.id), parentName: "食費" },
    ]);
  });

  it("loadParentCategoryOptions は親のみ返す", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", color: "#f00", sortOrder: 1 }).returning();
    await db.insert(categories).values({ name: "お菓子", kind: "variable", parentId: food.id }).returning();
    const options = await loadParentCategoryOptions(db);
    expect(options).toEqual([{ id: String(food.id), name: "食費", color: "#f00" }]);
  });

  it("loadCategories は parentId と sortOrder を含む", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 3 }).returning();
    const rows = await loadCategories(db);
    expect(rows[0]).toMatchObject({ id: String(food.id), parentId: null, sortOrder: 3 });
  });

  it("取引の category に親情報が付き、色は親のcolorになる", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", color: "#f00" }).returning();
    const [snack] = await db.insert(categories).values({ name: "お菓子", kind: "variable", parentId: food.id }).returning();
    await db.insert(transactions).values({ amount: 100, storeName: "A", purchasedAt: new Date(), source: "manual", categoryId: snack.id });
    const rows = await loadRecentTransactions(db, 10);
    expect(rows[0].category).toEqual({
      id: String(snack.id),
      name: "お菓子",
      color: "#f00",
      parentId: String(food.id),
      parentName: "食費",
    });
  });

  it("loadBudgetSettingsView は親カテゴリのみ列挙する", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 1 }).returning();
    await db.insert(categories).values({ name: "お菓子", kind: "variable", parentId: food.id });
    const rows = await loadBudgetSettingsView(db, "2026-07-01");
    expect(rows.map((r) => r.categoryName)).toEqual(["食費"]);
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `cd apps/web && npx vitest run src/lib/queries.test.ts`
Expected: 新テストが FAIL

- [ ] **Step 3: 実装**

`queries.ts` の変更点:

```typescript
import { alias } from "drizzle-orm/pg-core";
import { isNull } from "drizzle-orm"; // 既存importに追加済みか確認

export type CategoryRef = {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  parentName: string | null;
};
export type CategoryView = {
  id: string;
  name: string;
  kind: "fixed" | "variable";
  color: string | null;
  parentId: string | null;
  sortOrder: number;
};
export type CategoryOption = {
  id: string;
  name: string;
  color: string | null;
  parentId: string;
  parentName: string;
};
export type ParentCategoryOption = { id: string; name: string; color: string | null };
```

`selectTransactions`: 親 alias を join し category を組み立てる。

```typescript
const parentCategories = alias(categories, "parent_categories");
// select に追加: parentId: categories.parentId, parentName: parentCategories.name, parentColor: parentCategories.color
// .leftJoin(categories, eq(transactions.categoryId, categories.id))
// .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
// map:
category: r.catId == null ? null : {
  id: String(r.catId),
  name: r.catName!,
  color: r.parentColor ?? r.catColor,
  parentId: r.parentId == null ? null : String(r.parentId),
  parentName: r.parentName ?? null,
},
```

`loadCategories`: select に `parentId: categories.parentId, sortOrder: categories.sortOrder` を追加し map で `parentId: r.parentId == null ? null : String(r.parentId), sortOrder: r.sortOrder`。

`loadCategoryOptions`: 子のみを親 join で取得（`loadCategories` 経由をやめ独自クエリに）:

```typescript
export async function loadCategoryOptions(db: Db): Promise<CategoryOption[]> {
  const parent = alias(categories, "parent_categories");
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      parentName: parent.name,
      parentColor: parent.color,
    })
    .from(categories)
    .innerJoin(parent, eq(categories.parentId, parent.id))
    .orderBy(asc(parent.sortOrder), asc(parent.id), asc(categories.sortOrder), asc(categories.id));
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    color: r.parentColor,
    parentId: String(r.parentId),
    parentName: r.parentName,
  }));
}

export async function loadParentCategoryOptions(db: Db): Promise<ParentCategoryOption[]> {
  const rows = await db
    .select({ id: categories.id, name: categories.name, color: categories.color })
    .from(categories)
    .where(isNull(categories.parentId))
    .orderBy(asc(categories.sortOrder), asc(categories.id));
  return rows.map((r) => ({ id: String(r.id), name: r.name, color: r.color }));
}
```

`loadBudgetSettingsView`: categories の select に `.where(isNull(categories.parentId))` を追加。

- [ ] **Step 4: テスト成功確認 + 全体回帰**

Run: `cd apps/web && npx vitest run src/lib/queries.test.ts && npx vitest run`
Expected: PASS（他テストが `loadCategoryOptions` の旧挙動前提で落ちたら「子のみ」を前提にテスト側を修正。**実装をテストに合わせて緩めない**）
Note: `tsc` はまだ通らなくてよい（コンポーネントの型エラーは Task 8-11 で解消）。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/queries.ts apps/web/src/lib/queries.test.ts
git commit -m "feat(web): hierarchy-aware category loaders (child options, parent options)"
```

---

### Task 3: actions/categories.ts — 親・子の作成

**Files:**
- Modify: `apps/web/src/actions/categories.ts`
- Test: `apps/web/src/actions/categories.test.ts`（追記）

**Interfaces:**
- Produces: `createCategory(input: { name: string; kind?: "fixed" | "variable"; color?: string | null; parentId?: string | null }): Promise<ActionResult & { id?: string }>`
  - `parentId` なし → 親作成。`kind` 必須（無ければエラー「種別を選択してください」）
  - `parentId` あり → 子作成。親が存在し `parent.parentId == null` であること。kind は親からコピー、color は null
- Consumes: なし（updateCategory / deleteCategory は無変更）

- [ ] **Step 1: 失敗するテストを追記**

```typescript
describe("createCategory (階層)", () => {
  it("parentId 付きで子カテゴリを作成でき、kind は親からコピーされる", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "fixed" }).returning();
    const res = await createCategory({ name: "お菓子", parentId: String(parent.id) });
    expect(res.errors).toEqual([]);
    const rows = await testDb.select().from(categories);
    const child = rows.find((r) => r.parentId === parent.id)!;
    expect(child).toMatchObject({ name: "お菓子", kind: "fixed", parentId: parent.id, color: null });
    expect(res.id).toBe(String(child.id));
  });

  it("子カテゴリの下に子は作れない（孫禁止）", async () => {
    const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [child] = await testDb.insert(categories).values({ name: "お菓子", kind: "variable", parentId: parent.id }).returning();
    const res = await createCategory({ name: "駄菓子", parentId: String(child.id) });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(categories)).toHaveLength(2);
  });

  it("存在しない parentId はエラー", async () => {
    const res = await createCategory({ name: "お菓子", parentId: "999999" });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("親作成で kind 未指定はエラー", async () => {
    const res = await createCategory({ name: "食費" });
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
```

既存 `createCategory` テストは `kind` を渡しているため互換（シグネチャは optional 化）。

- [ ] **Step 2: 失敗確認**

Run: `cd apps/web && npx vitest run src/actions/categories.test.ts`
Expected: 新テスト FAIL

- [ ] **Step 3: 実装**

```typescript
const createSchema = z.object({
  name: z.string().trim().min(1, "カテゴリ名を入力してください"),
  kind: kindEnum.optional(),
  color: z.union([z.string(), z.null()]).optional(),
  parentId: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null || v === "" ? null : Number(v)))
    .refine((v) => v == null || Number.isInteger(v), "親カテゴリIDが不正です"),
});

export async function createCategory(input: {
  name: string;
  kind?: "fixed" | "variable";
  color?: string | null;
  parentId?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { name, kind, color, parentId } = parsed.data;

  let values: { name: string; kind: "fixed" | "variable"; color: string | null; parentId: number | null };
  if (parentId == null) {
    if (kind == null) return { errors: ["種別を選択してください"] };
    values = { name, kind, color: color ?? null, parentId: null };
  } else {
    const parent = (
      await db.select({ id: categories.id, kind: categories.kind, parentId: categories.parentId }).from(categories).where(eq(categories.id, parentId)).limit(1)
    )[0];
    if (!parent) return { errors: [`親カテゴリが見つかりません: ${parentId}`] };
    if (parent.parentId != null) return { errors: ["子カテゴリの下にカテゴリは作成できません"] };
    values = { name, kind: parent.kind, color: null, parentId };
  }

  const [created] = await db.insert(categories).values(values).returning({ id: categories.id });
  revalidatePath("/settings/categories");
  revalidatePath("/");
  return { errors: [], id: String(created.id) };
}
```

- [ ] **Step 4: テスト成功確認**

Run: `cd apps/web && npx vitest run src/actions/categories.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/actions/categories.ts apps/web/src/actions/categories.test.ts
git commit -m "feat(web): create child categories with grandchild prohibition"
```

---

### Task 4: 取引・マッピングの「子のみ」バリデーション

**Files:**
- Modify: `apps/web/src/actions/transactions.ts`, `apps/web/src/actions/mappings.ts`
- Test: `apps/web/src/actions/transactions.test.ts`, `apps/web/src/actions/mappings.test.ts`（追記）

**Interfaces:**
- Consumes: `getCategoryRole(db, id)`（Task 1）
- Produces: シグネチャ不変。categoryId が親カテゴリなら `{ errors: ["子カテゴリを選択してください"] }`、不存在なら `{ errors: ["カテゴリが見つかりません"] }`

- [ ] **Step 1: 失敗するテストを追記**

transactions.test.ts（親・子カテゴリを insert するセットアップは categories を import して行う）:

```typescript
it("createTransaction: 親カテゴリの割当は拒否", async () => {
  const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
  const res = await createTransaction({ storeName: "A", amount: 100, purchasedAt: "2026-07-01", categoryId: String(parent.id) });
  expect(res.errors).toEqual(["子カテゴリを選択してください"]);
  expect(await testDb.select().from(transactions)).toHaveLength(0);
});

it("createTransaction: 子カテゴリは割当できる", async () => {
  const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
  const [child] = await testDb.insert(categories).values({ name: "お菓子", kind: "variable", parentId: parent.id }).returning();
  const res = await createTransaction({ storeName: "A", amount: 100, purchasedAt: "2026-07-01", categoryId: String(child.id) });
  expect(res.errors).toEqual([]);
});

it("updateTransaction: 親カテゴリの割当は拒否", async () => {
  const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
  const [t] = await testDb
    .insert(transactions)
    .values({ storeName: "A", amount: 100, purchasedAt: new Date(), source: "manual" })
    .returning();
  const res = await updateTransaction({
    id: String(t.id),
    storeName: "A",
    amount: 100,
    purchasedAt: "2026-07-01",
    categoryId: String(parent.id),
  });
  expect(res.errors).toEqual(["子カテゴリを選択してください"]);
  const [after] = await testDb.select().from(transactions);
  expect(after.categoryId).toBeNull();
});

it("createTransaction: 存在しないカテゴリはエラー", async () => {
  const res = await createTransaction({ storeName: "A", amount: 100, purchasedAt: "2026-07-01", categoryId: "999999" });
  expect(res.errors).toEqual(["カテゴリが見つかりません"]);
});
```

mappings.test.ts:

```typescript
it("upsertStoreMapping: 親カテゴリは拒否", async () => {
  const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
  const res = await upsertStoreMapping({ storeName: "セブン", categoryId: String(parent.id) });
  expect(res.errors).toEqual(["子カテゴリを選択してください"]);
  expect(await testDb.select().from(storeCategoryMappings)).toHaveLength(0);
});
```

（子カテゴリでの成功は既存テストの categories セットアップを「親+子」に変えて担保。既存テストが親単独カテゴリを割当てて成功を期待している場合は、セットアップを子カテゴリに変更する）

- [ ] **Step 2: 失敗確認**

Run: `cd apps/web && npx vitest run src/actions/transactions.test.ts src/actions/mappings.test.ts`

- [ ] **Step 3: 実装**

両ファイルに共通ヘルパー呼び出しを追加（transactions.ts）:

```typescript
import { getCategoryRole } from "@/lib/category-tree";

// createTransaction / updateTransaction の parse 成功後、db.transaction の前に:
if (categoryId != null) {
  const role = await getCategoryRole(db, categoryId);
  if (role == null) return { errors: ["カテゴリが見つかりません"] };
  if (role !== "child") return { errors: ["子カテゴリを選択してください"] };
}
```

mappings.ts（upsertStoreMapping の parse 成功後）:

```typescript
const role = await getCategoryRole(db, numericCat);
if (role == null) return { errors: ["カテゴリが見つかりません"] };
if (role !== "child") return { errors: ["子カテゴリを選択してください"] };
```

- [ ] **Step 4: テスト成功確認**

Run: `cd apps/web && npx vitest run src/actions/transactions.test.ts src/actions/mappings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/actions/transactions.ts apps/web/src/actions/mappings.ts apps/web/src/actions/transactions.test.ts apps/web/src/actions/mappings.test.ts
git commit -m "feat(web): restrict transaction/mapping category assignment to child categories"
```

---

### Task 5: 予算・アラート設定の「親のみ」バリデーション

**Files:**
- Modify: `apps/web/src/actions/budgets.ts`, `apps/web/src/actions/alert-settings.ts`
- Test: `apps/web/src/actions/budgets.test.ts`, `apps/web/src/actions/alert-settings.test.ts`（追記）

**Interfaces:**
- Consumes: `getCategoryRole(db, id)`
- Produces: シグネチャ不変。categoryId が子なら `{ errors: ["親カテゴリを指定してください"] }`、不存在なら `{ errors: ["カテゴリが見つかりません"] }`。`upsertBudgetAlertSetting` の categoryId = null（全体設定）は検証スキップ

- [ ] **Step 1: 失敗するテストを追記**

```typescript
// budgets.test.ts
it("upsertBudget: 子カテゴリへの予算設定は拒否", async () => {
  const [parent] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
  const [child] = await testDb.insert(categories).values({ name: "お菓子", kind: "variable", parentId: parent.id }).returning();
  const res = await upsertBudget({ categoryId: String(child.id), amount: 10000, month: "2026-07-01" });
  expect(res.errors).toEqual(["親カテゴリを指定してください"]);
  expect(await testDb.select().from(budgets)).toHaveLength(0);
});

// alert-settings.test.ts — 同型のテストを upsertBudgetAlertSetting / upsertPaceAlertSetting に追加
// + categoryId: null の全体設定が引き続き成功すること
```

- [ ] **Step 2: 失敗確認**

Run: `cd apps/web && npx vitest run src/actions/budgets.test.ts src/actions/alert-settings.test.ts`

- [ ] **Step 3: 実装**

parse 成功後に（budgets.ts / alert-settings.ts の3関数。budgetAlertSetting は `categoryId != null` の場合のみ）:

```typescript
import { getCategoryRole } from "@/lib/category-tree";

const role = await getCategoryRole(db, numericCat);
if (role == null) return { errors: ["カテゴリが見つかりません"] };
if (role !== "parent") return { errors: ["親カテゴリを指定してください"] };
```

- [ ] **Step 4: テスト成功確認 → Step 5: Commit**

```bash
git add apps/web/src/actions/budgets.ts apps/web/src/actions/alert-settings.ts apps/web/src/actions/budgets.test.ts apps/web/src/actions/alert-settings.test.ts
git commit -m "feat(web): restrict budgets and alert settings to parent categories"
```

---

### Task 6: alerts.ts — 子取引を親に解決して判定

**Files:**
- Modify: `apps/web/src/lib/alerts.ts`
- Test: `apps/web/src/lib/alerts.test.ts`（追記・既存修正）

**Interfaces:**
- Consumes: `getAlertTargetCategoryIds(db, parentId)`（Task 1）
- Produces: `evaluateAlertsForTransaction` のシグネチャ不変。挙動変更:
  1. 取引の categoryId の `parentId` を解決し、親IDで evaluateBudgetAlert / evaluatePaceAlert を呼ぶ（parentId が null＝親直付けの場合は自身のIDのまま）
  2. spent 集計は `inArray(transactions.categoryId, targetIds)`（親+全子）に変更
  3. budgetAlerts / paceAlerts に記録される categoryId は**親ID**

- [ ] **Step 1: 失敗するテストを追記**

alerts.test.ts の既存セットアップを確認し、以下を追加:

```typescript
it("子カテゴリの取引で親の予算アラートが発火し、複数子の支出が合算される", async () => {
  // 親: 食費（予算 10000, 閾値 80%）、子: お菓子・外出
  // お菓子 5000 + 外出 4000 = 9000 (90%) → 親カテゴリIDで budgetAlerts が1件
  // budgetAlerts.categoryId === 親id を assert
});

it("子カテゴリの取引で親のペースアラートが発火する", async () => {
  // 親にペース設定、子の取引でペース超過 → paceAlerts.categoryId === 親id
});
```

（既存テストは「親直付け取引」で書かれているはず。親直付けはフォールバック動作として引き続き成功すること — 変更不要のまま通ることを確認）

- [ ] **Step 2: 失敗確認**

Run: `cd apps/web && npx vitest run src/lib/alerts.test.ts`

- [ ] **Step 3: 実装**

```typescript
import { inArray } from "drizzle-orm";
import { categories } from "../db/schema";
import { getAlertTargetCategoryIds } from "./category-tree";

export async function evaluateAlertsForTransaction(tx, transactionId) {
  // ...既存の取引取得...
  const categoryId = transaction.categoryId;
  if (categoryId == null) return;

  const catRow = (
    await tx.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, categoryId)).limit(1)
  )[0];
  const alertCategoryId = catRow?.parentId ?? categoryId; // 子→親へ解決。親直付けはそのまま

  await evaluateBudgetAlert(tx, alertCategoryId, transaction.purchasedAt);
  await evaluatePaceAlert(tx, alertCategoryId);
}
```

evaluateBudgetAlert / evaluatePaceAlert 内の spent クエリを変更:

```typescript
const targetIds = await getAlertTargetCategoryIds(tx, categoryId);
// where: eq(transactions.categoryId, categoryId) → inArray(transactions.categoryId, targetIds)
```

- [ ] **Step 4: テスト成功確認 → Step 5: Commit**

```bash
git add apps/web/src/lib/alerts.ts apps/web/src/lib/alerts.test.ts
git commit -m "feat(web): evaluate budget/pace alerts at parent category level"
```

---

### Task 7: monthly-summary — 親単位集計 + 子内訳

**Files:**
- Modify: `apps/web/src/lib/monthly-summary.ts`, `apps/web/src/lib/queries.ts`（loadMonthlySummaryView の map）
- Test: `apps/web/src/lib/monthly-summary.test.ts`（追記・既存修正）

**Interfaces:**
- Consumes: `getAlertTargetCategoryIds`（Task 1）、drizzle `alias`
- Produces:
  - `CategoryBreakdown` に `children: { categoryId: number; categoryName: string; amount: number }[]` を追加（金額降順）。`categoryId`/`categoryName` は**親**のものになる
  - `MonthlySummaryView.categoryBreakdowns[]` にも `children: { categoryId: string; categoryName: string; amount: number }[]` を追加

- [ ] **Step 1: 失敗するテストを追記**

```typescript
it("子カテゴリの取引は親単位で集計され、子内訳が金額降順で付く", async () => {
  // 親: 食費、子: お菓子(3000)・外出(7000)。別親: 趣味 > VTuber(1000)
  // categoryBreakdowns: [{categoryName: "食費", amount: 10000, children: [外出7000, お菓子3000]},
  //                      {categoryName: "趣味", amount: 1000, children: [VTuber 1000]}]
});

it("親の有効予算に対して子取引合算でペース計算される", async () => {
  // 親に当月予算、子の取引のみ → paceStatus / budgetAmount が親行に付く
});
```

（既存テストは親直付け取引前提のものが多いはず。親直付けは `children: [{親自身の内訳}]` ではなく「親行に直接計上・children は空 or 自身」どちらか迷うが、**親直付けは children に含めない**＝親行 amount にのみ算入とする。既存 assert に `children` が無くても toMatchObject なら通る）

- [ ] **Step 2: 失敗確認**

Run: `cd apps/web && npx vitest run src/lib/monthly-summary.test.ts`

- [ ] **Step 3: 実装**

grouped クエリを子行のまま取得し、JS で親へ集約する方針:

```typescript
import { alias } from "drizzle-orm/pg-core";
import { inArray } from "drizzle-orm";
import { getAlertTargetCategoryIds } from "./category-tree";

const parentCategories = alias(categories, "parent_categories");
const grouped = await db
  .select({
    childId: transactions.categoryId,
    childName: categories.name,
    parentId: sql<number>`coalesce(${categories.parentId}, ${categories.id})`,
    parentName: sql<string>`coalesce(${parentCategories.name}, ${categories.name})`,
    isChild: sql<boolean>`${categories.parentId} is not null`,
    amount: sql<string>`sum(${transactions.amount})`,
  })
  .from(transactions)
  .innerJoin(categories, eq(transactions.categoryId, categories.id))
  .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
  .where(and(gte(transactions.purchasedAt, start), lte(transactions.purchasedAt, end)))
  .groupBy(transactions.categoryId, categories.name, categories.parentId, categories.id, parentCategories.name);

// JS集約: Map<parentId, { name, amount, children: [] }>
// isChild の行のみ children に push（金額降順ソート）。親行 amount には全行を加算
```

ペース計算ループは親単位になり、spent クエリは:

```typescript
const targetIds = await getAlertTargetCategoryIds(db, parentId);
// eq(transactions.categoryId, categoryId) → inArray(transactions.categoryId, targetIds)
```

`queries.ts` の `loadMonthlySummaryView`: `children: b.children.map((c) => ({ categoryId: String(c.categoryId), categoryName: c.categoryName, amount: c.amount }))` を追加。

- [ ] **Step 4: テスト成功確認 + lib 全体回帰 → Step 5: Commit**

Run: `cd apps/web && npx vitest run src/lib`

```bash
git add apps/web/src/lib/monthly-summary.ts apps/web/src/lib/monthly-summary.test.ts apps/web/src/lib/queries.ts
git commit -m "feat(web): aggregate monthly summary by parent category with child breakdown"
```

---

### Task 8: UI — カテゴリ管理画面の親子対応

**Files:**
- Modify: `apps/web/src/components/category-management-content.tsx`, `apps/web/src/app/settings/categories/page.tsx`

**Interfaces:**
- Consumes: `loadCategories`（parentId/sortOrder 付き CategoryView）、`buildCategoryTree`、`createCategory({name, parentId})`
- Produces: Props は `initialCategories: CategoryView[]`（queries.ts の型をそのまま使う）

**挙動:**
- `buildCategoryTree(initialCategories)` でツリー化し、固定費/変動費セクションは親の kind で分ける
- 親カード内に子をリスト表示。親行: 名前・色（既存の編集/削除UIを踏襲）。子行: 名前のみ + 編集（名前）/削除
- 各親に「＋子カテゴリを追加」インライン入力（name のみ → `createCategory({ name, parentId })`）
- 親追加フォームは既存踏襲（name/kind/color）
- 親の削除確認文言に「子カテゴリもまとめて削除されます」を含める
- 取引が紐づく場合のエラーは既存どおり errors 表示

- [ ] **Step 1: page.tsx の型合わせ（loadCategories は変更済みなのでそのまま渡るはず）を確認し、コンポーネントを実装**
- [ ] **Step 2: `cd apps/web && npx tsc --noEmit` で本コンポーネント起因の型エラーがないこと**
- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/category-management-content.tsx apps/web/src/app/settings/categories/page.tsx
git commit -m "feat(web): two-level category management UI"
```

---

### Task 9: UI — カテゴリ選択（取引フォーム・マッピング・クイック分類）

**Files:**
- Modify: `apps/web/src/components/transaction-form-sheet.tsx`, `apps/web/src/components/mapping-management-content.tsx`, `apps/web/src/components/unclassified-quick-classify.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/settings/mappings/page.tsx`

**Interfaces:**
- Consumes: `CategoryOption`（子のみ、parentName 付き）、`ParentCategoryOption` / `loadParentCategoryOptions`、`createCategory({name, parentId})`
- Produces: `unclassified-quick-classify.tsx` の Props に `parentOptions: ParentCategoryOption[]` を追加

**挙動:**
- transaction-form-sheet: select を `<optgroup label={parentName}>` で親ごとにグルーピング（`getCategoryOptions()` の返り値は子のみになっている。parentName で group 化するユーティリティはコンポーネント内で `Map<parentName, CategoryOption[]>`）
- mapping-management-content: AddMappingForm / 行編集の select を同様に optgroup 化（Props の `CategoryOption` 型を queries の新型に合わせ、表示は `親名 > 子名` でも可）
- unclassified-quick-classify: CategoryPicker の一覧を親名グルーピング表示（親名の小見出し + 子ボタン）。「＋新しいカテゴリ」は「親カテゴリ select（parentOptions）+ 子名入力」に変更し `createCategory({ name, parentId })` → 返却 id で `upsertStoreMapping`。親が0件なら「先に設定画面で親カテゴリを作成してください」を表示
- page.tsx: `loadParentCategoryOptions(db)` を Promise.all に追加し `parentOptions` を渡す

- [ ] **Step 1: 実装**
- [ ] **Step 2: `cd apps/web && npx tsc --noEmit` で対象コンポーネント起因の型エラーがないこと**
- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/transaction-form-sheet.tsx apps/web/src/components/mapping-management-content.tsx apps/web/src/components/unclassified-quick-classify.tsx apps/web/src/app/page.tsx apps/web/src/app/settings/mappings/page.tsx
git commit -m "feat(web): parent-grouped child category pickers"
```

---

### Task 10: UI — 予算・アラート設定を親のみに

**Files:**
- Modify: `apps/web/src/app/settings/alerts/page.tsx`（`loadCategories` → `loadParentCategoryOptions`）
- Verify: `apps/web/src/app/settings/budgets/page.tsx`（`loadBudgetSettingsView` が親のみ返すため無変更のはず。確認のみ）

**Interfaces:**
- Consumes: `loadParentCategoryOptions`。alert-settings-content の `CategoryData = { id, name }` は `ParentCategoryOption` と構造互換

- [ ] **Step 1: page.tsx 修正 + tsc 確認 → Step 2: Commit**

```bash
git add apps/web/src/app/settings/alerts/page.tsx
git commit -m "feat(web): alert settings list parent categories only"
```

---

### Task 11: UI — サマリー子内訳 + フィルターの親子対応

**Files:**
- Modify: 月次サマリー表示コンポーネント（`BudgetList`）, `apps/web/src/components/category-filter-chips.tsx`, `apps/web/src/hooks/use-category-filter.ts`（実パスは grep で確認）, 呼び出し元 `TransactionsView` / `CalendarPageContent`

**Interfaces:**
- Consumes: `MonthlySummaryView.categoryBreakdowns[].children`、`TransactionView.category.{parentId, parentName}`

**挙動:**
- BudgetList: 各親カードに `children.length > 0` なら `<details>` で子内訳（`子名 ¥金額` の行）を表示。Props の `CategoryBreakdown` 型に `children` を追加
- use-category-filter: フィルター状態を `{ parentId: string | null; childId: string | null }` に拡張
  - チップ一覧 = 取引から導出した親（`category.parentId + parentName`、色は `category.color`）のユニーク集合
  - 親選択中 → その親の子（取引に登場するもの）のチップ列を追加表示。子選択でさらに絞り込み
  - フィルタリング: `parentId` 選択時 `t.category?.parentId === parentId`、`childId` 選択時 `t.category?.id === childId`。「すべて」で解除。親を切り替えたら childId はリセット
- category-filter-chips: Props を `{ parents, childrenOfSelected, selected: {parentId, childId}, onSelect }` 形に変更（実装詳細はコンポーネントに閉じる）

- [ ] **Step 1: use-category-filter のユニットテストがあれば先に更新、なければ実装後に tsc + 全テストで確認**
- [ ] **Step 2: 実装 + `npx tsc --noEmit` 全体クリーン確認（ここまでで型エラー全解消）**
- [ ] **Step 3: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(web): parent/child filter chips and summary child breakdown"
```

---

### Task 12: リセットスクリプト

**Files:**
- Create: `apps/web/scripts/reset-categories.ts`（接続パターンは `apps/web/scripts/migrate-settings.ts` を読んで踏襲）

**挙動:**
- `DATABASE_URL` へ接続し単一トランザクションで:
  1. 各テーブルの対象件数を SELECT して表示（dry-run 情報）
  2. 環境変数 `CONFIRM=1` が無ければ「CONFIRM=1 を付けて再実行してください」と表示して終了（変更なし）
  3. `UPDATE transactions SET category_id = NULL`
  4. `DELETE FROM notifications WHERE notifiable_type IN ('BudgetAlert', 'PaceAlert')`
  5. `DELETE FROM budget_alerts` / `pace_alerts` / `budget_alert_settings` / `pace_alert_settings` / `store_category_mappings` / `budgets` / `categories`
  6. `refreshUnclassifiedAlert(tx)` を呼び未分類アラートを最新化
- 実行方法をファイル冒頭コメントに記載（例: `CONFIRM=1 npx tsx scripts/reset-categories.ts`）

- [ ] **Step 1: migrate-settings.ts を読み、同じ接続・実行スタイルで実装**
- [ ] **Step 2: 手元検証はしない（本番接続スクリプトのため）。tsc が通ることのみ確認: `npx tsc --noEmit`**
- [ ] **Step 3: Commit**

```bash
git add apps/web/scripts/reset-categories.ts
git commit -m "chore(web): add one-off category reset script"
```

---

### Task 13: 全体検証

- [ ] **Step 1: 全テスト**: `cd apps/web && npx vitest run` → 全PASS
- [ ] **Step 2: 型・lint**: `npx tsc --noEmit` / `npm run lint`（設定があれば）→ クリーン
- [ ] **Step 3: build**: `npm run build` → 成功
- [ ] **Step 4: 残課題があれば修正しコミット**

---

## 実行後の運用手順（ユーザー向け・実装後に案内）

1. 本番へデプロイ
2. `CONFIRM=1 npx tsx scripts/reset-categories.ts` で既存カテゴリをリセット（取引は未分類化）
3. 設定画面で親→子カテゴリを登録し、ホームのクイック分類で未分類取引を子カテゴリへ再分類
4. 予算・アラートを親カテゴリに設定し直す
