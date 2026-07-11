# pglite テストDB 再利用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** テストスイート並列実行時の pglite 起動タイムアウト（flaky）を根絶する。DB をファイルごとに1回だけ生成し、テスト間は TRUNCATE でリセットする。

**Architecture:** `src/test/db.ts` に `resetTestDb(client)`（public スキーマ全テーブルを動的列挙して `TRUNCATE ... RESTART IDENTITY CASCADE`）を追加。beforeEach/it ごとに `createTestDb()` していた7ファイルを「トップレベルで1回生成 + `beforeEach(resetTestDb)`」へ変換。`actions/*.test.ts` の手動テーブル削除も `resetTestDb` に統一（DRY）。

**Tech Stack:** Vitest / @electric-sql/pglite / Drizzle ORM

**Spec:** `docs/superpowers/specs/2026-07-11-test-db-reuse-design.md`

## Global Constraints

- 実装は git worktree 上（superpowers:using-git-worktrees、ベース: development）
- テスト実行: リポジトリルートから `pnpm -C apps/web test <path>`
- コミット: Conventional Commits + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- **テスト本体（it 内のアサーション・シード投入）は一切変更しない**。セットアップ/teardown のみ変更
- `vitest.config.ts` は変更しない

---

### Task 1: `resetTestDb` ヘルパ（TDD）

**Files:**
- Modify: `apps/web/src/test/db.ts`
- Create: `apps/web/src/test/db.test.ts`

**Interfaces:**
- Produces: `export async function resetTestDb(client: PGlite): Promise<void>` — public スキーマの全テーブルを TRUNCATE し、シーケンスをリセットする

- [ ] **Step 1: Write the failing test**

`apps/web/src/test/db.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { createTestDb, resetTestDb } from "./db";
import { categories, transactions } from "../db/schema";

const { db, client, teardown } = await createTestDb();

afterAll(async () => {
  await teardown();
});

describe("resetTestDb", () => {
  it("全テーブルを空にし、id採番も新規DBと同じ1から始まる", async () => {
    const [cat] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await db.insert(transactions).values({
      amount: 100,
      storeName: "A",
      purchasedAt: new Date(),
      source: "manual",
      categoryId: cat.id,
    });

    await resetTestDb(client);

    expect(await db.select().from(categories)).toHaveLength(0);
    expect(await db.select().from(transactions)).toHaveLength(0);

    // RESTART IDENTITY: 新規DBと同じく id=1 から
    const [cat2] = await db.insert(categories).values({ name: "趣味", kind: "variable" }).returning();
    expect(cat2.id).toBe(1);
  });

  it("外部キー参照があっても CASCADE で消せる（参照順に依存しない）", async () => {
    const [cat] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await db.insert(transactions).values({
      amount: 100,
      storeName: "A",
      purchasedAt: new Date(),
      source: "manual",
      categoryId: cat.id,
    });
    await expect(resetTestDb(client)).resolves.toBeUndefined();
    expect(await db.select().from(categories)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test src/test/db.test.ts`
Expected: FAIL（`resetTestDb` 未エクスポート）

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/test/db.ts` の `createTestDb` の後に追加:

```ts
/**
 * public スキーマの全テーブルを TRUNCATE し、シーケンスもリセットする。
 * 「テストごとに新規DB」と同じ初期状態を、PGlite を再生成せずに得るための共通リセット。
 * テーブルは動的に列挙するため、スキーマにテーブルが増えても修正不要。
 * （drizzle のマイグレーション管理テーブルは drizzle スキーマにあるため対象外）
 */
export async function resetTestDb(client: PGlite): Promise<void> {
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await client.exec(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test src/test/db.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/test/db.ts apps/web/src/test/db.test.ts
git commit -m "test(web): add resetTestDb helper for shared pglite instances"
```

---

### Task 2: DB使い捨てファイル7件を「1回生成 + リセット」へ変換

**Files:**
- Modify: `apps/web/src/lib/queries.test.ts`
- Modify: `apps/web/src/lib/notifications.test.ts`
- Modify: `apps/web/src/lib/effective-budget.test.ts`
- Modify: `apps/web/src/lib/monthly-summary.test.ts`
- Modify: `apps/web/src/lib/alerts.test.ts`
- Modify: `apps/web/src/app/api/inbound-email/route.test.ts`
- Modify: `apps/web/src/test/schema-smoke.test.ts`

**Interfaces:**
- Consumes: `createTestDb()` / `resetTestDb(client)`（Task 1）

**変換パターン**（全ファイル共通。it 内のコードは触らない）:

現状（例: `src/lib/queries.test.ts`）:

```ts
let db: TestDatabase;
let teardown: () => Promise<void>;

beforeEach(async () => {
  ({ db, teardown } = await createTestDb());
});

afterEach(async () => {
  await teardown();
});
```

変換後:

```ts
const { db, client, teardown } = await createTestDb();

beforeEach(async () => {
  await resetTestDb(client);
});

afterAll(async () => {
  await teardown();
});
```

- import に `resetTestDb` を追加、`afterEach` → `afterAll`（vitest の import も合わせて変更）
- `let db: TestDatabase` 宣言は const 化に伴い削除（`TestDatabase` 型 import が不要になれば削除）

**ファイル別の注意**:

- [ ] **Step 1: `queries.test.ts` / `notifications.test.ts` / `effective-budget.test.ts`** — 上記パターンそのまま（トップレベル beforeEach/afterEach を置換）

- [ ] **Step 2: `monthly-summary.test.ts`** — `({ db, teardown } = await createTestDb())` が各 **it の先頭**に7箇所ある。全て削除し、トップレベルに変換後パターンを置く（`beforeEach(resetTestDb)` が各 it 前に走るため同じ初期状態）

- [ ] **Step 3: `alerts.test.ts`** — describe 3ブロックの `beforeEach(async () => { setToday(); ({ db, teardown } = await createTestDb()); })` を `beforeEach(async () => { setToday(); await resetTestDb(client); })` に変更し、トップレベルで1回 `const { db, client, teardown } = await createTestDb()` + `afterAll(teardown)`。`setToday()` 呼び出しは維持

- [ ] **Step 4: `route.test.ts`** — `holder.current` への代入を beforeEach からトップレベル1回に変更:

```ts
const { db: testDb, client, teardown } = await createTestDb();
holder.current = testDb;

beforeEach(async () => {
  await resetTestDb(client);
});

afterAll(async () => {
  await teardown();
});
```

（`vi.hoisted` の holder / `vi.mock` getter 構造は変更しない。既存の beforeEach/afterEach 内の生成・teardown は削除）

- [ ] **Step 5: `schema-smoke.test.ts`** — it 内の `({ db, teardown } = await createTestDb())` を削除しトップレベル生成に変換。このファイルは「マイグレーション適用の smoke」の意図を保つ（生成1回で意図は満たされる）

- [ ] **Step 6: 変換した7ファイルのテストを実行**

Run: `pnpm -C apps/web test src/lib/queries.test.ts src/lib/notifications.test.ts src/lib/effective-budget.test.ts src/lib/monthly-summary.test.ts src/lib/alerts.test.ts src/app/api/inbound-email/route.test.ts src/test/schema-smoke.test.ts`
Expected: 全 PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/*.test.ts apps/web/src/app/api/inbound-email/route.test.ts apps/web/src/test/schema-smoke.test.ts
git commit -m "test(web): reuse single pglite instance per test file"
```

---

### Task 3: `actions/*.test.ts` の手動テーブル削除を `resetTestDb` へ統一

**Files:**
- Modify: `apps/web/src/actions/{alert-settings,budgets,categories,inbound-emails,mappings,notifications,transactions}.test.ts`（`auth.test.ts` は DB 不使用のため対象外。対象は `createTestDb` を import しているファイルのみ）

**Interfaces:**
- Consumes: `resetTestDb(client)`（Task 1）

- [ ] **Step 1: 各ファイルの beforeEach を置換**

現状パターン（例: `categories.test.ts`）:

```ts
const { db: testDb, teardown } = await createTestDb();
...
beforeEach(async () => {
  for (const t of [transactions, budgetAlerts, categories]) await testDb.delete(t);
});
```

変換後:

```ts
const { db: testDb, client, teardown } = await createTestDb();
...
beforeEach(async () => {
  await resetTestDb(client);
});
```

- 分割代入に `client` を追加し、`resetTestDb` を import
- テーブル列挙の delete ループを削除（列挙漏れの温床）。削除対象テーブルの import が不要になれば import も整理
- **注意**: 手動 delete はシーケンスをリセットしないが TRUNCATE はリセットする。id の絶対値を期待するテストがあれば挙動が「よりクリーン」になる方向なので、全テスト green を確認すれば良い

- [ ] **Step 2: actions テスト全実行**

Run: `pnpm -C apps/web test src/actions/`
Expected: 全 PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/actions/*.test.ts
git commit -m "test(web): unify per-test cleanup on resetTestDb"
```

---

### Task 4: 並列実行の安定性検証

- [ ] **Step 1: デフォルト並列で3回連続実行**

Run（各回 exit code とサマリ確認）:
```bash
pnpm -C apps/web exec vitest run   # ×3回
```
Expected: 3回とも全件 green。実行時間が従来の正常時（~50-100s）以下

- [ ] **Step 2: 3回のうち1回でも fail したら**

失敗内容を確認し、タイムアウトなら残存する `createTestDb` 多重呼び出しを探す（`grep -rn "createTestDb" apps/web/src | grep -v test/db` で beforeEach/it 内の呼び出しがゼロであること）。アサーション失敗なら TRUNCATE による状態リークを疑い、該当テストの前提（シーケンス・暗黙の既存行）を確認

- [ ] **Step 3: 最終コミット（残変更があれば）とマージ準備**

全 green を確認後、finishing-a-development-branch へ
