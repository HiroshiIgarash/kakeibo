# [移行B: アプリ層（Server Actions・画面データ層・認証）] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rails/GraphQL を廃した Next.js フルスタック構成において、(1) 更新系の Server Actions、(2) 全画面のデータ取得層を Apollo/GraphQL から Drizzle 直接クエリ + Server Actions へ差し替え、(3) 通知UIの InboundEmail 対応と RSC 通知ローダ、(4) カテゴリ種別UI定数の `'fixed'/'variable'` 化、(5) 共有パスワード認証（proxy + /login）を実装する。spec `docs/superpowers/specs/2026-07-09-rails-to-nextjs-migration-design.md` の実装フェーズ4・6相当。

**Architecture:** RSC が `src/lib/queries.ts` / `src/lib/notifications.ts` のローダ関数（Drizzle直接クエリ）を呼び、既存のプレゼンテーションコンポーネント（`src/components/*`）へ props で渡す。クライアント側の更新操作は `src/actions/*.ts` の Server Actions を命令的に呼び出し（既存の imperative な `useMutation` 呼び出しと同型に置換）、各アクションは zod で検証し、取引系はアラート判定を同一 DB トランザクション内で実行し、`revalidatePath` でRSCキャッシュを無効化する。認証は Next.js 16 の `proxy.ts`（旧 middleware）で cookie を検証する。

**Tech Stack:** Next.js 16.2.3（App Router / RSC / Server Functions / proxy.ts）、React 19.2.4、TypeScript、Drizzle ORM（postgres-js）、zod、Web Crypto API（HMAC-SHA256）、Vitest + `@electric-sql/pglite`（計画A提供のテスト基盤）。

## Global Constraints

これらは全タスクで厳守する。逸脱する場合はレビューで明示的に合意すること。

1. **計画A提供インターフェースを再定義しない**（consume のみ）。以下を所与とする。
   - `@/db/client` の `export const db`
   - `@/db/schema` のテーブル: `transactions, categories, budgets, budgetAlertSettings, budgetAlerts, paceAlertSettings, paceAlerts, storeCategoryMappings, unclassifiedAlerts, notifications, inboundEmails` と型 `DbTransaction`
   - `@/lib/alerts`: `evaluateAlertsForTransaction(tx: DbTransaction, transactionId: number): Promise<void>`、`refreshUnclassifiedAlert(tx: DbTransaction): Promise<void>`
   - `@/lib/budget-pace`: `calcBudgetPace(...)`
   - `@/lib/monthly-summary`: `getMonthlySummary(db, year, month)`
   - `@/lib/dates`: `jstToday()`, `jstDateParts(date)`, `jstMonthRange(year, month)`, `jstDaysInMonth(year, month)`, `jstDayOfMonth(date)`
   - `@/test/db`: pglite テストヘルパ
2. **計画Aの schema.ts のプロパティ命名は camelCase 前提**（例 `transactions.categoryId`, `transactions.purchasedAt`, `transactions.storeName`, `notifications.notifiableType`, `notifications.notifiableId`, `notifications.readAt`, `budgetAlerts.usagePercent`, `inboundEmails.messageId`, `inboundEmails.errorMessage`, `createdAt`/`updatedAt`）。列オブジェクトの実名が異なる場合はローダ/アクション内の該当参照のみ修正する（コンポーネント側は不変）。
3. **`jstMonthRange(year, month)` は `{ start: Date, end: Date }`（月初00:00:00 JST 〜 月末23:59:59.999 JST）を返す前提**。`getMonthlySummary` の戻り値は camelCase（`{ totalAmount, budgetAmount, remainingAmount, categoryBreakdowns: [{ categoryId:number, categoryName, amount, percentage, paceStatus, budgetAmount, remainingAmount, dailyAmount }] }`）前提。これらの実キー名が異なる場合、`src/lib/queries.ts` の該当ローダのみ修正する。
4. **ID のシリアライズ規約**: DB の `id`（bigserial → number）を UI へ渡す際は必ず `String(...)` で文字列化する（既存コンポーネントは `id: string` を期待）。逆に Server Actions がクライアントから受け取る `id` 系（string）は `Number(...)` で数値化して DB クエリに使う。
5. **日付規約**: `purchased_at` は timestamptz（JS `Date`）。UI へ渡す `purchasedAt` は必ず `toJstDateString()` で `"YYYY-MM-DD"`（JST）に変換する。UI から受け取る `"YYYY-MM-DD"` は `jstDateInputToDate()` で JST 0時の `Date` に変換して保存する（Task 1 で実装）。
6. **手動取引の source は常に `'manual'`**（サーバー側で固定。クライアントから受け取らない）。
7. **revalidate 戦略**: 取引系アクションは `revalidatePath('/', 'layout')`（全RSC再取得。単一ユーザーで許容）。設定系アクションは対象ページ + `'/'` を revalidate。クライアント側は必要に応じ `router.refresh()` を併用する（各タスクで明示）。
8. **`middleware.ts` は Next.js 16 で `proxy.ts` にリネームされた**（`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` 参照。関数名も `proxy`）。spec の "middleware.ts" は本計画では `src/proxy.ts` として実装する。Proxy は Next 16 では既定で Node.js ランタイムだが、Web Crypto（`globalThis.crypto.subtle`）は Node でも利用可能なため spec の HMAC-SHA256 実装方針をそのまま踏襲する。
9. **`/settings/mail` には触らない**（計画Cで削除）。本計画では `settings/page.tsx` のメニューから "メール通知" 項目のみ削除する（項目残置だとリンク切れになるため）。
10. Server Actions のファイル冒頭には必ず `'use server'` を置く。読み取り専用の補助（`getCategoryOptions` 等）も同ファイルに置いてよい。
11. コミットは各タスク末尾で1回。コミットメッセージ末尾に必ず以下を付す。
    ```
    Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
    ```

---

## Task 1: シリアライズ/日付ユーティリティ（`src/lib/serialize.ts`）

UI 境界での日付変換を1箇所に集約する。純粋関数なので Vitest で先にテストする。

**Files:**
- Create: `apps/web/src/lib/serialize.ts`
- Test: `apps/web/src/lib/serialize.test.ts`

**Interfaces:**
- Produces: `toJstDateString(date: Date): string`（JST の `"YYYY-MM-DD"`）、`jstDateInputToDate(dateStr: string): Date`（`"YYYY-MM-DD"` → JST 0時の `Date`）
- Consumes: なし（外部依存なし）

**Steps:**
- [ ] テストを先に書く。`apps/web/src/lib/serialize.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { toJstDateString, jstDateInputToDate } from "./serialize";

  describe("toJstDateString", () => {
    it("UTC の Date を JST 日付文字列に変換する", () => {
      // 2026-07-08 16:00 UTC = 2026-07-09 01:00 JST
      expect(toJstDateString(new Date("2026-07-08T16:00:00Z"))).toBe("2026-07-09");
    });
    it("JST 0時ちょうどの瞬間はその日", () => {
      // 2026-07-08 15:00 UTC = 2026-07-09 00:00 JST
      expect(toJstDateString(new Date("2026-07-08T15:00:00Z"))).toBe("2026-07-09");
    });
    it("JST 前日23:59はその前日", () => {
      // 2026-07-08 14:59 UTC = 2026-07-08 23:59 JST
      expect(toJstDateString(new Date("2026-07-08T14:59:00Z"))).toBe("2026-07-08");
    });
  });

  describe("jstDateInputToDate", () => {
    it("YYYY-MM-DD を JST 0時の絶対時刻に変換する", () => {
      // 2026-07-09 00:00 JST = 2026-07-08 15:00 UTC
      expect(jstDateInputToDate("2026-07-09").toISOString()).toBe("2026-07-08T15:00:00.000Z");
    });
    it("往復で同じ日付になる", () => {
      expect(toJstDateString(jstDateInputToDate("2026-01-31"))).toBe("2026-01-31");
    });
  });
  ```
- [ ] テスト失敗を確認: `pnpm --filter web exec vitest run src/lib/serialize.test.ts`（モジュール未実装で失敗すること）
- [ ] 実装 `apps/web/src/lib/serialize.ts`:
  ```ts
  const JST_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  /** JS Date を JST の "YYYY-MM-DD" に変換する（DBは常にUTC、解釈はアプリ層で行う方針: spec §3.2） */
  export function toJstDateString(date: Date): string {
    // en-CA ロケールは YYYY-MM-DD 形式を返す
    return JST_DATE_FMT.format(date);
  }

  /** "YYYY-MM-DD"（フォーム入力）を JST 0時ちょうどの絶対時刻(Date)へ変換する */
  export function jstDateInputToDate(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00+09:00`);
  }
  ```
- [ ] テストパス確認: `pnpm --filter web exec vitest run src/lib/serialize.test.ts`
- [ ] commit: `git add apps/web/src/lib/serialize.ts apps/web/src/lib/serialize.test.ts && git commit -m "feat(web): add JST date serialization helpers"`

---

## Task 2: 依存追加（zod）

Server Actions のバリデーションに zod を使う（spec §8）。

**Files:**
- Modify: `apps/web/package.json`（`dependencies` に `zod` 追加。行番号: 12-26 の dependencies ブロック）

**Steps:**
- [ ] `pnpm --filter web add zod` を実行（`apps/web/package.json` と root `pnpm-lock.yaml` が更新される。npm は使わない・`package-lock.json` は生成しない）
- [ ] `pnpm --filter web exec tsc --noEmit`（型解決が通ること。既存の GraphQL 依存が残っていてもこの時点ではエラーにならない）
- [ ] commit: `git add apps/web/package.json pnpm-lock.yaml && git commit -m "chore(web): add zod dependency"`

---

## Task 3: RSC データローダ（`src/lib/queries.ts`）

各画面が使う Drizzle クエリを1モジュールに集約し、UI が期待する形（id は文字列、`purchasedAt` は JST 日付文字列）へ整形して返す。`getMonthlySummary` の categoryId を文字列化するビュー変換もここに置く。

**Files:**
- Create: `apps/web/src/lib/queries.ts`
- Test: `apps/web/src/lib/queries.test.ts`（pglite）

**Interfaces:**
- Consumes: `@/db/client` の `db`、`@/db/schema`、`@/lib/monthly-summary` の `getMonthlySummary`、`@/lib/dates` の `jstMonthRange`、`@/lib/serialize`
- Produces（全て `db` を第1引数に取り、テスト時は pglite を注入可能にする）:
  - `loadRecentTransactions(db, limit): Promise<TransactionView[]>`
  - `loadTransactionsByMonth(db, year, month): Promise<TransactionView[]>`
  - `loadMonthlySummaryView(db, year, month): Promise<MonthlySummaryView>`
  - `loadCategories(db): Promise<CategoryView[]>`
  - `loadCategoryOptions(db): Promise<CategoryOption[]>`
  - `loadStoreMappings(db): Promise<StoreMappingView[]>`
  - `loadAlertSettingsView(db): Promise<AlertSettingsView>`

**Steps:**
- [ ] pglite テストを先に書く。`apps/web/src/lib/queries.test.ts`（計画Aの `@/test/db` ヘルパ利用。ヘルパの正確なエクスポート名が異なる場合はそれに合わせる）:
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { createTestDb } from "@/test/db"; // 計画A提供（名称が違う場合は合わせる）
  import { categories, transactions } from "@/db/schema";
  import {
    loadRecentTransactions,
    loadTransactionsByMonth,
    loadCategories,
    loadStoreMappings,
  } from "./queries";

  // createTestDb() は { db, client, teardown } を返す。db だけを取り出して使う（計画A提供の戻り値シェイプ）。
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];
  let teardown: () => Promise<void>;
  beforeEach(async () => {
    ({ db, teardown } = await createTestDb());
  });
  afterEach(async () => {
    await teardown();
  });

  describe("loadTransactionsByMonth", () => {
    it("指定月の取引を purchasedAt 降順・id文字列・JST日付で返す", async () => {
      const [cat] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
      await db.insert(transactions).values([
        { amount: 100, storeName: "A", purchasedAt: new Date("2026-07-01T03:00:00Z"), source: "manual", categoryId: cat.id },
        { amount: 200, storeName: "B", purchasedAt: new Date("2026-07-15T03:00:00Z"), source: "manual", categoryId: null },
        { amount: 300, storeName: "C", purchasedAt: new Date("2026-06-30T03:00:00Z"), source: "manual", categoryId: null },
      ]);
      const rows = await loadTransactionsByMonth(db, 2026, 7);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ storeName: "B", purchasedAt: "2026-07-15", category: null });
      expect(rows[1]).toMatchObject({ storeName: "A", purchasedAt: "2026-07-01" });
      expect(typeof rows[0].id).toBe("string");
      expect(rows[1].category?.name).toBe("食費");
      expect(typeof rows[1].category?.id).toBe("string");
    });
  });

  describe("loadRecentTransactions", () => {
    it("limit 件を purchasedAt 降順で返す", async () => {
      await db.insert(transactions).values([
        { amount: 1, storeName: "A", purchasedAt: new Date("2026-07-01T03:00:00Z"), source: "manual", categoryId: null },
        { amount: 2, storeName: "B", purchasedAt: new Date("2026-07-05T03:00:00Z"), source: "manual", categoryId: null },
      ]);
      const rows = await loadRecentTransactions(db, 1);
      expect(rows).toHaveLength(1);
      expect(rows[0].storeName).toBe("B");
    });
  });

  describe("loadCategories", () => {
    it("sortOrder 昇順で kind をそのまま返す", async () => {
      await db.insert(categories).values([
        { name: "住居", kind: "fixed", sortOrder: 1 },
        { name: "食費", kind: "variable", sortOrder: 0 },
      ]);
      const rows = await loadCategories(db);
      expect(rows.map((c) => c.name)).toEqual(["食費", "住居"]);
      expect(rows[0]).toMatchObject({ kind: "variable" });
      expect(typeof rows[0].id).toBe("string");
    });
  });

  describe("loadStoreMappings", () => {
    it("storeName 昇順・category 同梱で返す", async () => {
      const [cat] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0, color: "#fff" }).returning();
      const { storeCategoryMappings } = await import("@/db/schema");
      await db.insert(storeCategoryMappings).values([
        { storeName: "ローソン", categoryId: cat.id },
        { storeName: "イオン", categoryId: cat.id },
      ]);
      const rows = await loadStoreMappings(db);
      expect(rows.map((m) => m.storeName)).toEqual(["イオン", "ローソン"]);
      expect(rows[0].category).toMatchObject({ name: "食費", color: "#fff" });
      expect(typeof rows[0].categoryId).toBe("string");
    });
  });
  ```
- [ ] テスト失敗を確認: `pnpm --filter web exec vitest run src/lib/queries.test.ts`
- [ ] 実装 `apps/web/src/lib/queries.ts`:
  ```ts
  import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
  import type { db as DbClient } from "@/db/client";
  import {
    transactions,
    categories,
    storeCategoryMappings,
    budgetAlertSettings,
    paceAlertSettings,
  } from "@/db/schema";
  import { getMonthlySummary } from "@/lib/monthly-summary";
  import { jstMonthRange } from "@/lib/dates";
  import { toJstDateString } from "@/lib/serialize";

  // db は本番シングルトンまたは pglite テストDBのどちらも受け入れる
  type Db = typeof DbClient;

  export type CategoryRef = { id: string; name: string; color: string | null };
  export type TransactionView = {
    id: string;
    amount: number;
    storeName: string;
    purchasedAt: string; // JST "YYYY-MM-DD"
    memo: string | null;
    category: CategoryRef | null;
  };
  export type CategoryView = { id: string; name: string; kind: "fixed" | "variable"; color: string | null };
  export type CategoryOption = { id: string; name: string; color: string | null };
  export type StoreMappingView = {
    id: string;
    storeName: string;
    categoryId: string;
    category: CategoryRef;
  };
  export type MonthlySummaryView = {
    totalAmount: number;
    budgetAmount: number;
    remainingAmount: number;
    categoryBreakdowns: Array<{
      categoryId: string;
      categoryName: string;
      amount: number;
      paceStatus: "GREEN" | "YELLOW" | "RED" | null;
      budgetAmount: number | null;
      remainingAmount: number | null;
      dailyAmount: number | null;
    }>;
  };
  export type AlertSettingsView = {
    budgetAlertSettings: Array<{
      id: string;
      categoryId: string | null;
      threshold: number;
      threshold2: number | null;
      isActive: boolean;
      category: { id: string; name: string } | null;
    }>;
    paceAlertSettings: Array<{
      id: string;
      categoryId: string;
      threshold: number;
      activeFromDay: number;
      isActive: boolean;
      category: { id: string; name: string };
    }>;
  };

  function toCategoryRef(row: { id: number; name: string; color: string | null } | null): CategoryRef | null {
    if (!row) return null;
    return { id: String(row.id), name: row.name, color: row.color };
  }

  // 取引行を category 同梱の TransactionView へ整形する共通クエリ
  async function selectTransactions(
    db: Db,
    where: ReturnType<typeof and> | undefined,
    limit?: number,
  ): Promise<TransactionView[]> {
    const q = db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        storeName: transactions.storeName,
        purchasedAt: transactions.purchasedAt,
        memo: transactions.memo,
        catId: categories.id,
        catName: categories.name,
        catColor: categories.color,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .orderBy(desc(transactions.purchasedAt), desc(transactions.id));
    const rows = limit != null ? await q.limit(limit) : await q;
    return rows.map((r) => ({
      id: String(r.id),
      amount: r.amount,
      storeName: r.storeName,
      purchasedAt: toJstDateString(r.purchasedAt),
      memo: r.memo,
      category: r.catId == null ? null : { id: String(r.catId), name: r.catName!, color: r.catColor },
    }));
  }

  export async function loadRecentTransactions(db: Db, limit: number): Promise<TransactionView[]> {
    return selectTransactions(db, undefined, limit);
  }

  export async function loadTransactionsByMonth(db: Db, year: number, month: number): Promise<TransactionView[]> {
    const { start, end } = jstMonthRange(year, month);
    return selectTransactions(
      db,
      and(gte(transactions.purchasedAt, start), lte(transactions.purchasedAt, end)),
    );
  }

  export async function loadMonthlySummaryView(db: Db, year: number, month: number): Promise<MonthlySummaryView> {
    const s = await getMonthlySummary(db, year, month);
    return {
      totalAmount: s.totalAmount,
      budgetAmount: s.budgetAmount,
      remainingAmount: s.remainingAmount,
      categoryBreakdowns: s.categoryBreakdowns.map((b) => ({
        categoryId: String(b.categoryId),
        categoryName: b.categoryName,
        amount: b.amount,
        paceStatus: b.paceStatus ?? null,
        budgetAmount: b.budgetAmount ?? null,
        remainingAmount: b.remainingAmount ?? null,
        dailyAmount: b.dailyAmount ?? null,
      })),
    };
  }

  export async function loadCategories(db: Db): Promise<CategoryView[]> {
    const rows = await db
      .select({ id: categories.id, name: categories.name, kind: categories.kind, color: categories.color })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.id));
    return rows.map((r) => ({ id: String(r.id), name: r.name, kind: r.kind, color: r.color }));
  }

  export async function loadCategoryOptions(db: Db): Promise<CategoryOption[]> {
    const rows = await loadCategories(db);
    return rows.map((c) => ({ id: c.id, name: c.name, color: c.color }));
  }

  export async function loadStoreMappings(db: Db): Promise<StoreMappingView[]> {
    const rows = await db
      .select({
        id: storeCategoryMappings.id,
        storeName: storeCategoryMappings.storeName,
        categoryId: storeCategoryMappings.categoryId,
        catId: categories.id,
        catName: categories.name,
        catColor: categories.color,
      })
      .from(storeCategoryMappings)
      .innerJoin(categories, eq(storeCategoryMappings.categoryId, categories.id))
      .orderBy(asc(storeCategoryMappings.storeName));
    return rows.map((r) => ({
      id: String(r.id),
      storeName: r.storeName,
      categoryId: String(r.categoryId),
      category: { id: String(r.catId), name: r.catName, color: r.catColor },
    }));
  }

  export async function loadAlertSettingsView(db: Db): Promise<AlertSettingsView> {
    const budgetRows = await db
      .select({
        id: budgetAlertSettings.id,
        categoryId: budgetAlertSettings.categoryId,
        threshold: budgetAlertSettings.threshold,
        threshold2: budgetAlertSettings.threshold2,
        isActive: budgetAlertSettings.isActive,
        catId: categories.id,
        catName: categories.name,
      })
      .from(budgetAlertSettings)
      .leftJoin(categories, eq(budgetAlertSettings.categoryId, categories.id));
    const paceRows = await db
      .select({
        id: paceAlertSettings.id,
        categoryId: paceAlertSettings.categoryId,
        threshold: paceAlertSettings.threshold,
        activeFromDay: paceAlertSettings.activeFromDay,
        isActive: paceAlertSettings.isActive,
        catId: categories.id,
        catName: categories.name,
      })
      .from(paceAlertSettings)
      .innerJoin(categories, eq(paceAlertSettings.categoryId, categories.id));
    return {
      budgetAlertSettings: budgetRows.map((r) => ({
        id: String(r.id),
        categoryId: r.categoryId == null ? null : String(r.categoryId),
        threshold: r.threshold,
        threshold2: r.threshold2,
        isActive: r.isActive,
        category: r.catId == null ? null : { id: String(r.catId), name: r.catName! },
      })),
      paceAlertSettings: paceRows.map((r) => ({
        id: String(r.id),
        categoryId: String(r.categoryId),
        threshold: r.threshold,
        activeFromDay: r.activeFromDay,
        isActive: r.isActive,
        category: { id: String(r.catId), name: r.catName },
      })),
    };
  }
  ```
- [ ] テストパス確認: `pnpm --filter web exec vitest run src/lib/queries.test.ts`
- [ ] commit: `git add apps/web/src/lib/queries.ts apps/web/src/lib/queries.test.ts && git commit -m "feat(web): add RSC data loaders (Drizzle)"`

---

## Task 4: RSC 通知ローダ（`src/lib/notifications.ts`）― Union 型合成（spec §8.1）

`notifications` を取得 → `notifiable_type` ごとにグルーピング → 対応テーブルへ `IN` 句で2次クエリ → `notification-list.tsx` が期待する union 型オブジェクトを合成する。`InboundEmail` を含める。

**Files:**
- Create: `apps/web/src/lib/notifications.ts`
- Test: `apps/web/src/lib/notifications.test.ts`（pglite）

**Interfaces:**
- Consumes: `@/db/schema`（`notifications, budgetAlerts, paceAlerts, unclassifiedAlerts, inboundEmails, categories`）
- Produces: `loadUnreadNotifications(db, limit): Promise<NotificationView[]>`、型 `NotificationView`

**Steps:**
- [ ] テストを先に書く。`apps/web/src/lib/notifications.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { createTestDb } from "@/test/db";
  import { categories, budgetAlerts, unclassifiedAlerts, inboundEmails, notifications } from "@/db/schema";
  import { loadUnreadNotifications } from "./notifications";

  // createTestDb() は { db, client, teardown } を返す（計画A提供の戻り値シェイプ）。
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];
  let teardown: () => Promise<void>;
  beforeEach(async () => { ({ db, teardown } = await createTestDb()); });
  afterEach(async () => { await teardown(); });

  it("未読のみを created_at 降順で、notifiable を合成して返す", async () => {
    const [cat] = await db.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    const [ba] = await db.insert(budgetAlerts).values({ categoryId: cat.id, month: "2026-07-01", threshold: 80, usagePercent: 85 }).returning();
    const [ua] = await db.insert(unclassifiedAlerts).values({ count: 3 }).returning();
    const [ie] = await db.insert(inboundEmails).values({ messageId: "m1", from: "x@vpass.ne.jp", subject: "件名", rawBody: "body", status: "failed", errorMessage: "金額抽出失敗" }).returning();
    await db.insert(notifications).values([
      { notifiableType: "BudgetAlert", notifiableId: ba.id },
      { notifiableType: "UnclassifiedAlert", notifiableId: ua.id },
      { notifiableType: "InboundEmail", notifiableId: ie.id },
    ]);
    const rows = await loadUnreadNotifications(db, 5);
    expect(rows).toHaveLength(3);
    const byType = Object.fromEntries(rows.map((r) => [r.notifiable.__typename, r.notifiable]));
    expect(byType.BudgetAlert).toMatchObject({ threshold: 80, usagePercent: 85, category: { name: "食費" } });
    expect(byType.UnclassifiedAlert).toMatchObject({ count: 3 });
    expect(byType.InboundEmail).toMatchObject({ subject: "件名", errorMessage: "金額抽出失敗" });
    expect(typeof rows[0].id).toBe("string");
  });

  it("既読(readAt 非null)は除外する", async () => {
    const [ua] = await db.insert(unclassifiedAlerts).values({ count: 1 }).returning();
    await db.insert(notifications).values({ notifiableType: "UnclassifiedAlert", notifiableId: ua.id, readAt: new Date() });
    expect(await loadUnreadNotifications(db, 5)).toHaveLength(0);
  });
  ```
- [ ] テスト失敗を確認: `pnpm --filter web exec vitest run src/lib/notifications.test.ts`
- [ ] 実装 `apps/web/src/lib/notifications.ts`:
  ```ts
  import { desc, eq, inArray, isNull } from "drizzle-orm";
  import type { db as DbClient } from "@/db/client";
  import { notifications, budgetAlerts, paceAlerts, unclassifiedAlerts, inboundEmails, categories } from "@/db/schema";
  import { toJstDateString } from "@/lib/serialize";

  type Db = typeof DbClient;

  export type Notifiable =
    | { __typename: "BudgetAlert"; category: { name: string }; threshold: number; usagePercent: number }
    | { __typename: "PaceAlert"; category: { name: string }; month: string }
    | { __typename: "UnclassifiedAlert"; count: number }
    | { __typename: "InboundEmail"; subject: string | null; from: string; errorMessage: string | null };

  export type NotificationView = { id: string; notifiable: Notifiable };

  export async function loadUnreadNotifications(db: Db, limit: number): Promise<NotificationView[]> {
    const notes = await db
      .select({ id: notifications.id, type: notifications.notifiableType, notifiableId: notifications.notifiableId })
      .from(notifications)
      .where(isNull(notifications.readAt))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit);
    if (notes.length === 0) return [];

    const idsByType = new Map<string, number[]>();
    for (const n of notes) {
      const arr = idsByType.get(n.type) ?? [];
      arr.push(n.notifiableId);
      idsByType.set(n.type, arr);
    }

    // 2次クエリ。type ごとに対応テーブルへ IN 句で引き、notifiable_id をキーに Map 化する
    const budgetMap = new Map<number, Notifiable>();
    const paceMap = new Map<number, Notifiable>();
    const unclassifiedMap = new Map<number, Notifiable>();
    const inboundMap = new Map<number, Notifiable>();

    const budgetIds = idsByType.get("BudgetAlert");
    if (budgetIds?.length) {
      const rows = await db
        .select({ id: budgetAlerts.id, threshold: budgetAlerts.threshold, usagePercent: budgetAlerts.usagePercent, catName: categories.name })
        .from(budgetAlerts)
        .innerJoin(categories, eq(budgetAlerts.categoryId, categories.id))
        .where(inArray(budgetAlerts.id, budgetIds));
      for (const r of rows) budgetMap.set(r.id, { __typename: "BudgetAlert", category: { name: r.catName }, threshold: r.threshold, usagePercent: r.usagePercent });
    }

    const paceIds = idsByType.get("PaceAlert");
    if (paceIds?.length) {
      const rows = await db
        .select({ id: paceAlerts.id, month: paceAlerts.month, catName: categories.name })
        .from(paceAlerts)
        .innerJoin(categories, eq(paceAlerts.categoryId, categories.id))
        .where(inArray(paceAlerts.id, paceIds));
      for (const r of rows) paceMap.set(r.id, { __typename: "PaceAlert", category: { name: r.catName }, month: String(r.month) });
    }

    const unclassifiedIds = idsByType.get("UnclassifiedAlert");
    if (unclassifiedIds?.length) {
      const rows = await db
        .select({ id: unclassifiedAlerts.id, count: unclassifiedAlerts.count })
        .from(unclassifiedAlerts)
        .where(inArray(unclassifiedAlerts.id, unclassifiedIds));
      for (const r of rows) unclassifiedMap.set(r.id, { __typename: "UnclassifiedAlert", count: r.count });
    }

    const inboundIds = idsByType.get("InboundEmail");
    if (inboundIds?.length) {
      const rows = await db
        .select({ id: inboundEmails.id, subject: inboundEmails.subject, from: inboundEmails.from, errorMessage: inboundEmails.errorMessage })
        .from(inboundEmails)
        .where(inArray(inboundEmails.id, inboundIds));
      for (const r of rows) inboundMap.set(r.id, { __typename: "InboundEmail", subject: r.subject, from: r.from, errorMessage: r.errorMessage });
    }

    const pick = (type: string, id: number): Notifiable | null => {
      switch (type) {
        case "BudgetAlert": return budgetMap.get(id) ?? null;
        case "PaceAlert": return paceMap.get(id) ?? null;
        case "UnclassifiedAlert": return unclassifiedMap.get(id) ?? null;
        case "InboundEmail": return inboundMap.get(id) ?? null;
        default: return null;
      }
    };

    // 元の created_at 降順を保ちつつ、対応レコードが消えているものは除外する
    return notes.flatMap((n) => {
      const notifiable = pick(n.type, n.notifiableId);
      return notifiable ? [{ id: String(n.id), notifiable }] : [];
    });
  }
  ```
  注: `toJstDateString` は現状 pace の `month` 表示に未使用（`month` は date 列で `String(...)` 済み）。将来使う場合に備え import は残さず、未使用なら削除する（`pnpm --filter web exec tsc --noEmit` で検出）。
- [ ] `toJstDateString` の未使用 import を削除（PaceAlert.month は date 列文字列をそのまま使うため）。実装から `import { toJstDateString } ...` 行を消す。
- [ ] テストパス確認: `pnpm --filter web exec vitest run src/lib/notifications.test.ts`
- [ ] commit: `git add apps/web/src/lib/notifications.ts apps/web/src/lib/notifications.test.ts && git commit -m "feat(web): add RSC notification loader with union assembly"`

---

## Task 5: 取引 Server Actions（`src/actions/transactions.ts`）+ アラート同期実行（spec §5.5）

作成/更新/削除を zod 検証し、取引の insert/update/delete と 5.3〜5.6 のアラート判定を**同一 DB トランザクション内**で実行する。

**Files:**
- Create: `apps/web/src/actions/transactions.ts`
- Test: `apps/web/src/actions/transactions.test.ts`（pglite）

**Interfaces:**
- Consumes: `@/db/client` の `db`、`@/db/schema` の `transactions`、`@/lib/alerts` の `evaluateAlertsForTransaction` / `refreshUnclassifiedAlert`、`@/lib/serialize` の `jstDateInputToDate`、`next/cache` の `revalidatePath`
- Produces: `createTransaction(input): Promise<ActionResult>`、`updateTransaction(input): Promise<ActionResult>`、`deleteTransaction(input): Promise<ActionResult>`。`ActionResult = { errors: string[] }`

**Steps:**
- [ ] テストを先に書く。`next/cache` はモックする。`apps/web/src/actions/transactions.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
  import { createTestDb } from "@/test/db";

  vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

  // db シングルトンをテストDBへ差し替える。createTestDb() は { db, client, teardown } を返す
  // （計画A提供の戻り値シェイプ）ので db だけを testDb として使う。
  const { db: testDb, teardown } = await createTestDb();
  vi.mock("@/db/client", () => ({ db: testDb }));

  const { categories, budgets, budgetAlertSettings, transactions, budgetAlerts, unclassifiedAlerts, notifications } = await import("@/db/schema");
  const { createTransaction, updateTransaction, deleteTransaction } = await import("./transactions");

  afterAll(async () => {
    await teardown();
  });

  beforeEach(async () => {
    // 各テーブルを truncate（createTestDb がテストごとに新規DBを返すなら不要。ヘルパ仕様に合わせる）
    for (const t of [notifications, budgetAlerts, unclassifiedAlerts, transactions, budgets, budgetAlertSettings, categories]) {
      await testDb.delete(t);
    }
  });

  it("手動作成で source=manual の取引が入り、予算アラートが判定される", async () => {
    const [cat] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    await testDb.insert(budgets).values({ categoryId: cat.id, month: "2026-07-01", amount: 1000 });
    await testDb.insert(budgetAlertSettings).values({ categoryId: cat.id, threshold: 80, isActive: true });

    const res = await createTransaction({ storeName: "A", amount: 900, purchasedAt: "2026-07-10", categoryId: String(cat.id) });
    expect(res.errors).toEqual([]);
    const txns = await testDb.select().from(transactions);
    expect(txns).toHaveLength(1);
    expect(txns[0].source).toBe("manual");
    const alerts = await testDb.select().from(budgetAlerts);
    expect(alerts).toHaveLength(1); // 90% >= 80%
  });

  it("未分類作成で unclassified_alerts が更新される", async () => {
    const res = await createTransaction({ storeName: "謎の店", amount: 500, purchasedAt: "2026-07-10", categoryId: null });
    expect(res.errors).toEqual([]);
    const ua = await testDb.select().from(unclassifiedAlerts);
    expect(ua[0]?.count).toBe(1);
  });

  it("金額0はバリデーションエラー", async () => {
    const res = await createTransaction({ storeName: "A", amount: 0, purchasedAt: "2026-07-10", categoryId: null });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(transactions)).toHaveLength(0);
  });

  it("削除後に未分類件数が再計算される", async () => {
    const c = await createTransaction({ storeName: "A", amount: 100, purchasedAt: "2026-07-10", categoryId: null });
    expect(c.errors).toEqual([]);
    const [t] = await testDb.select().from(transactions);
    const res = await deleteTransaction({ id: String(t.id) });
    expect(res.errors).toEqual([]);
    expect(await testDb.select().from(transactions)).toHaveLength(0);
    const ua = await testDb.select().from(unclassifiedAlerts);
    expect(ua).toHaveLength(0); // count 0 なら削除される（spec §5.6）
  });
  ```
- [ ] テスト失敗を確認: `pnpm --filter web exec vitest run src/actions/transactions.test.ts`
- [ ] 実装 `apps/web/src/actions/transactions.ts`:
  ```ts
  "use server";

  import { z } from "zod";
  import { eq } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { db } from "@/db/client";
  import { transactions } from "@/db/schema";
  import { evaluateAlertsForTransaction, refreshUnclassifiedAlert } from "@/lib/alerts";
  import { jstDateInputToDate } from "@/lib/serialize";

  export type ActionResult = { errors: string[] };

  const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が不正です");
  // categoryId は文字列ID または null/空。zod で数値IDへ正規化する
  const optionalCategoryId = z
    .union([z.string(), z.null()])
    .transform((v) => (v == null || v === "" ? null : Number(v)))
    .refine((v) => v == null || Number.isInteger(v), "カテゴリIDが不正です");

  const createSchema = z.object({
    storeName: z.string().trim().min(1, "店舗名を入力してください"),
    amount: z.number().int("金額は整数で入力してください").positive("金額は1以上の数値を入力してください"),
    purchasedAt: dateStr,
    categoryId: optionalCategoryId,
  });

  const updateSchema = createSchema.extend({ id: z.string().min(1) });
  const deleteSchema = z.object({ id: z.string().min(1) });

  export async function createTransaction(input: {
    storeName: string; amount: number; purchasedAt: string; categoryId: string | null;
  }): Promise<ActionResult> {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const { storeName, amount, purchasedAt, categoryId } = parsed.data;

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(transactions)
        .values({
          storeName,
          amount,
          purchasedAt: jstDateInputToDate(purchasedAt),
          categoryId,
          source: "manual",
        })
        .returning({ id: transactions.id });
      if (categoryId != null) await evaluateAlertsForTransaction(tx, row.id);
      await refreshUnclassifiedAlert(tx);
    });

    revalidatePath("/", "layout");
    return { errors: [] };
  }

  export async function updateTransaction(input: {
    id: string; storeName: string; amount: number; purchasedAt: string; categoryId: string | null;
  }): Promise<ActionResult> {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const { id, storeName, amount, purchasedAt, categoryId } = parsed.data;
    const numericId = Number(id);

    let notFound = false;
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(transactions)
        .set({ storeName, amount, purchasedAt: jstDateInputToDate(purchasedAt), categoryId })
        .where(eq(transactions.id, numericId))
        .returning({ id: transactions.id });
      if (updated.length === 0) { notFound = true; return; }
      if (categoryId != null) await evaluateAlertsForTransaction(tx, updated[0].id);
      await refreshUnclassifiedAlert(tx);
    });
    if (notFound) return { errors: [`IDが見つかりません: ${id}`] };

    revalidatePath("/", "layout");
    return { errors: [] };
  }

  export async function deleteTransaction(input: { id: string }): Promise<ActionResult> {
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const numericId = Number(parsed.data.id);

    let notFound = false;
    await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(transactions)
        .where(eq(transactions.id, numericId))
        .returning({ id: transactions.id });
      if (deleted.length === 0) { notFound = true; return; }
      await refreshUnclassifiedAlert(tx);
    });
    if (notFound) return { errors: [`IDが見つかりません: ${input.id}`] };

    revalidatePath("/", "layout");
    return { errors: [] };
  }
  ```
  設計注: Rails は update 時 `category_id` が present の場合のみ再判定していたが、本実装は「取引が変化した全経路でアラート判定を通す」spec §5.5 の方針に従い、categoryId 非null なら常に `evaluateAlertsForTransaction`、全経路で `refreshUnclassifiedAlert` を呼ぶ。`evaluateAlertsForTransaction` は予算未設定・設定なし時に no-op（spec §5.3）。
- [ ] テストパス確認: `pnpm --filter web exec vitest run src/actions/transactions.test.ts`
- [ ] commit: `git add apps/web/src/actions/transactions.ts apps/web/src/actions/transactions.test.ts && git commit -m "feat(web): add transaction server actions with synchronous alert evaluation"`

---

## Task 6: カテゴリ Server Actions（`src/actions/categories.ts`）

作成/更新/削除 + 取引フォーム用のカテゴリ取得。削除は spec §4.3 の整合性チェック（参照レコードがあれば拒否、子カテゴリは再帰削除）を実装する。

**Files:**
- Create: `apps/web/src/actions/categories.ts`
- Test: `apps/web/src/actions/categories.test.ts`（pglite）

**Interfaces:**
- Consumes: `@/db/client`、`@/db/schema`（`categories, transactions, budgets, budgetAlertSettings, paceAlertSettings, paceAlerts, storeCategoryMappings`）、`@/lib/queries` の `loadCategoryOptions`、`@/lib/alerts` の `refreshUnclassifiedAlert`、`next/cache`
- Produces: `createCategory`, `updateCategory`, `deleteCategory`（各 `Promise<ActionResult>`）、`getCategoryOptions(): Promise<CategoryOption[]>`（読み取り）

**Steps:**
- [ ] テストを先に書く。`apps/web/src/actions/categories.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
  import { createTestDb } from "@/test/db";
  vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
  // createTestDb() は { db, client, teardown } を返す（計画A提供の戻り値シェイプ）。
  const { db: testDb, teardown } = await createTestDb();
  vi.mock("@/db/client", () => ({ db: testDb }));
  const { categories, transactions } = await import("@/db/schema");
  const { createCategory, updateCategory, deleteCategory } = await import("./categories");

  afterAll(async () => {
    await teardown();
  });

  beforeEach(async () => {
    for (const t of [transactions, categories]) await testDb.delete(t);
  });

  it("kind 'fixed'/'variable' で作成できる", async () => {
    const res = await createCategory({ name: "住居", kind: "fixed", color: "#111" });
    expect(res.errors).toEqual([]);
    const rows = await testDb.select().from(categories);
    expect(rows[0]).toMatchObject({ name: "住居", kind: "fixed", color: "#111" });
  });

  it("不正な kind は拒否", async () => {
    const res = await createCategory({ name: "x", kind: "FixedCategory" as never, color: null });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("名前空欄は拒否", async () => {
    const res = await createCategory({ name: "  ", kind: "variable", color: null });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("取引が紐づくカテゴリは削除できない（spec §4.3）", async () => {
    const [cat] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    await testDb.insert(transactions).values({ amount: 1, storeName: "A", purchasedAt: new Date(), source: "manual", categoryId: cat.id });
    const res = await deleteCategory({ id: String(cat.id) });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(categories)).toHaveLength(1);
  });

  it("参照のないカテゴリは削除できる", async () => {
    const [cat] = await testDb.insert(categories).values({ name: "娯楽", kind: "variable", sortOrder: 0 }).returning();
    const res = await deleteCategory({ id: String(cat.id) });
    expect(res.errors).toEqual([]);
    expect(await testDb.select().from(categories)).toHaveLength(0);
  });
  ```
- [ ] テスト失敗を確認: `pnpm --filter web exec vitest run src/actions/categories.test.ts`
- [ ] 実装 `apps/web/src/actions/categories.ts`:
  ```ts
  "use server";

  import { z } from "zod";
  import { and, eq } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { db } from "@/db/client";
  import {
    categories, transactions, budgets, budgetAlertSettings,
    paceAlertSettings, paceAlerts, storeCategoryMappings,
  } from "@/db/schema";
  import type { DbTransaction } from "@/db/schema";
  import { loadCategoryOptions, type CategoryOption } from "@/lib/queries";

  export type ActionResult = { errors: string[] };

  const kindEnum = z.enum(["fixed", "variable"]);
  const createSchema = z.object({
    name: z.string().trim().min(1, "カテゴリ名を入力してください"),
    kind: kindEnum,
    color: z.union([z.string(), z.null()]).optional(),
  });
  const updateSchema = z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1, "カテゴリ名を入力してください"),
    color: z.union([z.string(), z.null()]).optional(),
  });
  const deleteSchema = z.object({ id: z.string().min(1) });

  export async function getCategoryOptions(): Promise<CategoryOption[]> {
    return loadCategoryOptions(db);
  }

  export async function createCategory(input: { name: string; kind: "fixed" | "variable"; color: string | null }): Promise<ActionResult> {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const { name, kind, color } = parsed.data;
    await db.insert(categories).values({ name, kind, color: color ?? null });
    revalidatePath("/settings/categories");
    revalidatePath("/");
    return { errors: [] };
  }

  export async function updateCategory(input: { id: string; name: string; color: string | null }): Promise<ActionResult> {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const { id, name, color } = parsed.data;
    const updated = await db
      .update(categories)
      .set({ name, color: color ?? null })
      .where(eq(categories.id, Number(id)))
      .returning({ id: categories.id });
    if (updated.length === 0) return { errors: [`IDが見つかりません: ${id}`] };
    revalidatePath("/settings/categories");
    revalidatePath("/");
    return { errors: [] };
  }

  // spec §4.3: 参照レコードが1件でもあれば削除不可。子カテゴリは再帰削除。
  async function hasReferences(tx: DbTransaction, categoryId: number): Promise<boolean> {
    const checks = [
      tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.categoryId, categoryId)).limit(1),
      tx.select({ id: budgets.id }).from(budgets).where(eq(budgets.categoryId, categoryId)).limit(1),
      tx.select({ id: budgetAlertSettings.id }).from(budgetAlertSettings).where(eq(budgetAlertSettings.categoryId, categoryId)).limit(1),
      tx.select({ id: paceAlertSettings.id }).from(paceAlertSettings).where(eq(paceAlertSettings.categoryId, categoryId)).limit(1),
      tx.select({ id: paceAlerts.id }).from(paceAlerts).where(eq(paceAlerts.categoryId, categoryId)).limit(1),
      tx.select({ id: storeCategoryMappings.id }).from(storeCategoryMappings).where(eq(storeCategoryMappings.categoryId, categoryId)).limit(1),
    ];
    const results = await Promise.all(checks);
    return results.some((r) => r.length > 0);
  }

  async function deleteRecursively(tx: DbTransaction, categoryId: number): Promise<string[]> {
    // 子カテゴリを先に再帰削除
    const children = await tx.select({ id: categories.id }).from(categories).where(eq(categories.parentId, categoryId));
    for (const child of children) {
      const childErrors = await deleteRecursively(tx, child.id);
      if (childErrors.length > 0) return childErrors;
    }
    if (await hasReferences(tx, categoryId)) {
      return ["このカテゴリには取引・予算などが紐づいているため削除できません"];
    }
    await tx.delete(categories).where(eq(categories.id, categoryId));
    return [];
  }

  export async function deleteCategory(input: { id: string }): Promise<ActionResult> {
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const numericId = Number(parsed.data.id);

    let errors: string[] = [];
    await db.transaction(async (tx) => {
      const exists = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, numericId)).limit(1);
      if (exists.length === 0) { errors = [`IDが見つかりません: ${input.id}`]; return; }
      errors = await deleteRecursively(tx, numericId);
      if (errors.length > 0) throw new Error("__rollback__"); // 参照ありならロールバック
    }).catch((e) => { if (!(e instanceof Error && e.message === "__rollback__")) throw e; });

    if (errors.length > 0) return { errors };
    revalidatePath("/settings/categories");
    revalidatePath("/");
    return { errors: [] };
  }
  ```
  注: `DbTransaction` 型は計画A提供。`categories.parentId` 列名は camelCase 前提（Global Constraint 2）。
- [ ] テストパス確認: `pnpm --filter web exec vitest run src/actions/categories.test.ts`
- [ ] commit: `git add apps/web/src/actions/categories.ts apps/web/src/actions/categories.test.ts && git commit -m "feat(web): add category server actions with referential integrity"`

---

## Task 7: 予算 Server Actions（`src/actions/budgets.ts`）

現状UIからの呼び出し口はないが、`upsert_budget` / `delete_budget` mutation の移植として実装する（将来の予算編集画面用。task範囲に明記）。

**Files:**
- Create: `apps/web/src/actions/budgets.ts`
- Test: `apps/web/src/actions/budgets.test.ts`（pglite）

**Interfaces:**
- Consumes: `@/db/client`、`@/db/schema` の `budgets`、`next/cache`
- Produces: `upsertBudget({ categoryId, amount, month })`, `deleteBudget({ id })`（各 `Promise<ActionResult>`）

**Steps:**
- [ ] テストを先に書く。`apps/web/src/actions/budgets.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
  import { createTestDb } from "@/test/db";
  vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
  // createTestDb() は { db, client, teardown } を返す（計画A提供の戻り値シェイプ）。
  const { db: testDb, teardown } = await createTestDb();
  vi.mock("@/db/client", () => ({ db: testDb }));
  const { categories, budgets } = await import("@/db/schema");
  const { upsertBudget, deleteBudget } = await import("./budgets");

  afterAll(async () => {
    await teardown();
  });

  let catId: number;
  beforeEach(async () => {
    await testDb.delete(budgets); await testDb.delete(categories);
    const [c] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    catId = c.id;
  });

  it("新規作成し、同カテゴリ・同月なら金額を更新（upsert）", async () => {
    expect((await upsertBudget({ categoryId: String(catId), amount: 1000, month: "2026-07-01" })).errors).toEqual([]);
    expect((await upsertBudget({ categoryId: String(catId), amount: 2000, month: "2026-07-01" })).errors).toEqual([]);
    const rows = await testDb.select().from(budgets);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(2000);
  });

  it("金額0以下は拒否", async () => {
    expect((await upsertBudget({ categoryId: String(catId), amount: 0, month: "2026-07-01" })).errors.length).toBeGreaterThan(0);
  });
  ```
- [ ] テスト失敗を確認: `pnpm --filter web exec vitest run src/actions/budgets.test.ts`
- [ ] 実装 `apps/web/src/actions/budgets.ts`:
  ```ts
  "use server";

  import { z } from "zod";
  import { and, eq } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { db } from "@/db/client";
  import { budgets } from "@/db/schema";

  export type ActionResult = { errors: string[] };

  const upsertSchema = z.object({
    categoryId: z.string().min(1),
    amount: z.number().int().positive("金額は1以上で入力してください"),
    month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "月の形式が不正です"),
  });
  const deleteSchema = z.object({ id: z.string().min(1) });

  export async function upsertBudget(input: { categoryId: string; amount: number; month: string }): Promise<ActionResult> {
    const parsed = upsertSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const { categoryId, amount, month } = parsed.data;
    const numericCat = Number(categoryId);

    // (category_id, month) の一意制約に基づく upsert
    const existing = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(eq(budgets.categoryId, numericCat), eq(budgets.month, month)))
      .limit(1);
    if (existing.length > 0) {
      await db.update(budgets).set({ amount }).where(eq(budgets.id, existing[0].id));
    } else {
      await db.insert(budgets).values({ categoryId: numericCat, month, amount });
    }
    revalidatePath("/");
    return { errors: [] };
  }

  export async function deleteBudget(input: { id: string }): Promise<ActionResult> {
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const deleted = await db.delete(budgets).where(eq(budgets.id, Number(parsed.data.id))).returning({ id: budgets.id });
    if (deleted.length === 0) return { errors: [`IDが見つかりません: ${input.id}`] };
    revalidatePath("/");
    return { errors: [] };
  }
  ```
  注: `budgets.month` は date 列。Drizzle の date 列は `mode: 'string'`（`"YYYY-MM-DD"`）前提。`mode: 'date'` の場合は `month: new Date(...)` へ変更する（計画A の schema 定義に合わせる）。
- [ ] テストパス確認: `pnpm --filter web exec vitest run src/actions/budgets.test.ts`
- [ ] commit: `git add apps/web/src/actions/budgets.ts apps/web/src/actions/budgets.test.ts && git commit -m "feat(web): add budget upsert/delete server actions"`

---

## Task 8: アラート設定 Server Actions（`src/actions/alert-settings.ts`）

`upsert_alert_setting` mutation を、予算/ペースの2アクションに分割移植する（`settingType` 分岐を廃し、型安全に）。Rails のバリデーション（BudgetAlertSetting: threshold 1-200, threshold2 > threshold; PaceAlertSetting: threshold 101-500, activeFromDay 1-28）を zod で再現。`find_or_initialize_by(category_id)` の upsert を踏襲。

**Files:**
- Create: `apps/web/src/actions/alert-settings.ts`
- Test: `apps/web/src/actions/alert-settings.test.ts`（pglite）

**Interfaces:**
- Consumes: `@/db/client`、`@/db/schema`（`budgetAlertSettings, paceAlertSettings`）、`next/cache`
- Produces: `upsertBudgetAlertSetting({ categoryId, threshold, threshold2, isActive })`、`upsertPaceAlertSetting({ categoryId, threshold, activeFromDay, isActive })`

**Steps:**
- [ ] テストを先に書く。`apps/web/src/actions/alert-settings.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
  import { createTestDb } from "@/test/db";
  vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
  // createTestDb() は { db, client, teardown } を返す（計画A提供の戻り値シェイプ）。
  const { db: testDb, teardown } = await createTestDb();
  vi.mock("@/db/client", () => ({ db: testDb }));
  const { categories, budgetAlertSettings, paceAlertSettings } = await import("@/db/schema");
  const { upsertBudgetAlertSetting, upsertPaceAlertSetting } = await import("./alert-settings");

  afterAll(async () => {
    await teardown();
  });

  let catId: number;
  beforeEach(async () => {
    await testDb.delete(budgetAlertSettings); await testDb.delete(paceAlertSettings); await testDb.delete(categories);
    const [c] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    catId = c.id;
  });

  it("予算アラート: 同カテゴリで upsert される", async () => {
    expect((await upsertBudgetAlertSetting({ categoryId: String(catId), threshold: 80, threshold2: 100, isActive: true })).errors).toEqual([]);
    expect((await upsertBudgetAlertSetting({ categoryId: String(catId), threshold: 70, threshold2: null, isActive: false })).errors).toEqual([]);
    const rows = await testDb.select().from(budgetAlertSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ threshold: 70, threshold2: null, isActive: false });
  });

  it("予算アラート: threshold2 <= threshold は拒否", async () => {
    const res = await upsertBudgetAlertSetting({ categoryId: String(catId), threshold: 100, threshold2: 80, isActive: true });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("予算アラート: categoryId=null（全体）も作成できる", async () => {
    expect((await upsertBudgetAlertSetting({ categoryId: null, threshold: 90, threshold2: null, isActive: true })).errors).toEqual([]);
    const rows = await testDb.select().from(budgetAlertSettings);
    expect(rows[0].categoryId).toBeNull();
  });

  it("ペースアラート: threshold 100以下は拒否", async () => {
    const res = await upsertPaceAlertSetting({ categoryId: String(catId), threshold: 100, activeFromDay: 5, isActive: true });
    expect(res.errors.length).toBeGreaterThan(0);
  });
  ```
- [ ] テスト失敗を確認: `pnpm --filter web exec vitest run src/actions/alert-settings.test.ts`
- [ ] 実装 `apps/web/src/actions/alert-settings.ts`:
  ```ts
  "use server";

  import { z } from "zod";
  import { eq, isNull } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { db } from "@/db/client";
  import { budgetAlertSettings, paceAlertSettings } from "@/db/schema";

  export type ActionResult = { errors: string[] };

  const budgetSchema = z
    .object({
      categoryId: z.union([z.string(), z.null()]).transform((v) => (v == null || v === "" ? null : Number(v))),
      threshold: z.number().int().gt(0, "閾値は1以上で入力してください").lte(200, "閾値は200以下で入力してください"),
      threshold2: z.union([z.number().int().gt(0).lte(200), z.null()]),
      isActive: z.boolean(),
    })
    .refine((d) => d.threshold2 == null || d.threshold2 > d.threshold, {
      message: "第2閾値は第1閾値より大きい値にしてください",
      path: ["threshold2"],
    });

  const paceSchema = z.object({
    categoryId: z.string().min(1),
    threshold: z.number().int().gt(100, "ペース閾値は101以上で入力してください").lte(500, "ペース閾値は500以下で入力してください"),
    activeFromDay: z.number().int().gt(0, "開始日は1以上").lte(28, "開始日は28以下"),
    isActive: z.boolean(),
  });

  export async function upsertBudgetAlertSetting(input: {
    categoryId: string | null; threshold: number; threshold2: number | null; isActive: boolean;
  }): Promise<ActionResult> {
    const parsed = budgetSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const { categoryId, threshold, threshold2, isActive } = parsed.data;

    const whereCat = categoryId == null ? isNull(budgetAlertSettings.categoryId) : eq(budgetAlertSettings.categoryId, categoryId);
    const existing = await db.select({ id: budgetAlertSettings.id }).from(budgetAlertSettings).where(whereCat).limit(1);
    if (existing.length > 0) {
      await db.update(budgetAlertSettings).set({ threshold, threshold2, isActive }).where(eq(budgetAlertSettings.id, existing[0].id));
    } else {
      await db.insert(budgetAlertSettings).values({ categoryId, threshold, threshold2, isActive });
    }
    revalidatePath("/settings/alerts");
    return { errors: [] };
  }

  export async function upsertPaceAlertSetting(input: {
    categoryId: string; threshold: number; activeFromDay: number; isActive: boolean;
  }): Promise<ActionResult> {
    const parsed = paceSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const { categoryId, threshold, activeFromDay, isActive } = parsed.data;
    const numericCat = Number(categoryId);

    const existing = await db.select({ id: paceAlertSettings.id }).from(paceAlertSettings).where(eq(paceAlertSettings.categoryId, numericCat)).limit(1);
    if (existing.length > 0) {
      await db.update(paceAlertSettings).set({ threshold, activeFromDay, isActive }).where(eq(paceAlertSettings.id, existing[0].id));
    } else {
      await db.insert(paceAlertSettings).values({ categoryId: numericCat, threshold, activeFromDay, isActive });
    }
    revalidatePath("/settings/alerts");
    return { errors: [] };
  }
  ```
- [ ] テストパス確認: `pnpm --filter web exec vitest run src/actions/alert-settings.test.ts`
- [ ] commit: `git add apps/web/src/actions/alert-settings.ts apps/web/src/actions/alert-settings.test.ts && git commit -m "feat(web): add budget/pace alert setting server actions"`

---

## Task 9: マッピング Server Actions（`src/actions/mappings.ts`）― NFKC 正規化 + 再分類（spec §5.6, §6.1, §13）

`store_name` を NFKC 正規化して保存（`find_or_initialize_by(store_name)` upsert）。さらに spec §5.6/§13 に従い、マッピング作成/更新時に**同一 store_name の未分類取引を事後分類**し、`refreshUnclassifiedAlert` を呼ぶ。

**Files:**
- Create: `apps/web/src/actions/mappings.ts`
- Test: `apps/web/src/actions/mappings.test.ts`（pglite）

**Interfaces:**
- Consumes: `@/db/client`、`@/db/schema`（`storeCategoryMappings, transactions`）、`@/lib/alerts` の `evaluateAlertsForTransaction` / `refreshUnclassifiedAlert`、`next/cache`
- Produces: `upsertStoreMapping({ storeName, categoryId })`, `deleteStoreMapping({ id })`。正規化関数 `normalizeStoreName(s)` も同ファイルに export（parser と規則を一致させるため、email-parser 側でも import 可能に）

**Steps:**
- [ ] テストを先に書く。`apps/web/src/actions/mappings.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
  import { createTestDb } from "@/test/db";
  vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
  // createTestDb() は { db, client, teardown } を返す（計画A提供の戻り値シェイプ）。
  const { db: testDb, teardown } = await createTestDb();
  vi.mock("@/db/client", () => ({ db: testDb }));
  const { categories, transactions, storeCategoryMappings, unclassifiedAlerts, notifications } = await import("@/db/schema");
  const { upsertStoreMapping, deleteStoreMapping, normalizeStoreName } = await import("./mappings");

  afterAll(async () => {
    await teardown();
  });

  let catId: number;
  beforeEach(async () => {
    for (const t of [notifications, unclassifiedAlerts, transactions, storeCategoryMappings, categories]) await testDb.delete(t);
    const [c] = await testDb.insert(categories).values({ name: "食費", kind: "variable", sortOrder: 0 }).returning();
    catId = c.id;
  });

  it("store_name を NFKC 正規化して保存する", async () => {
    // 全角英数 "ＡＢＣ" → "ABC"
    expect((await upsertStoreMapping({ storeName: "ＡＢＣ", categoryId: String(catId) })).errors).toEqual([]);
    const rows = await testDb.select().from(storeCategoryMappings);
    expect(rows[0].storeName).toBe("ABC");
  });

  it("normalizeStoreName は全角ハイフン/英数を吸収する", () => {
    expect(normalizeStoreName("セブン－イレブン")).toBe(normalizeStoreName("セブン-イレブン"));
  });

  it("マッピング作成時に同名の未分類取引を事後分類し未分類件数を再計算する（spec §5.6）", async () => {
    await testDb.insert(transactions).values({ amount: 100, storeName: "ＡＢＣ", purchasedAt: new Date(), source: "manual", categoryId: null });
    const res = await upsertStoreMapping({ storeName: "ABC", categoryId: String(catId) });
    expect(res.errors).toEqual([]);
    const txns = await testDb.select().from(transactions);
    expect(txns[0].categoryId).toBe(catId); // 未分類が分類された
    expect(await testDb.select().from(unclassifiedAlerts)).toHaveLength(0); // count 0 → 削除
  });
  ```
- [ ] テスト失敗を確認: `pnpm --filter web exec vitest run src/actions/mappings.test.ts`
- [ ] 実装 `apps/web/src/actions/mappings.ts`:
  ```ts
  "use server";

  import { z } from "zod";
  import { eq, isNull } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { db } from "@/db/client";
  import { storeCategoryMappings, transactions } from "@/db/schema";
  import { evaluateAlertsForTransaction, refreshUnclassifiedAlert } from "@/lib/alerts";

  export type ActionResult = { errors: string[] };

  /** 店舗名の正規化規則（spec §6.1）。parser 側と一致させる */
  export function normalizeStoreName(s: string): string {
    return s.normalize("NFKC").trim();
  }

  const upsertSchema = z.object({
    storeName: z.string().trim().min(1, "店名を入力してください"),
    categoryId: z.string().min(1, "カテゴリを選択してください"),
  });
  const deleteSchema = z.object({ id: z.string().min(1) });

  export async function upsertStoreMapping(input: { storeName: string; categoryId: string }): Promise<ActionResult> {
    const parsed = upsertSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const normalized = normalizeStoreName(parsed.data.storeName);
    const numericCat = Number(parsed.data.categoryId);

    await db.transaction(async (tx) => {
      // find_or_initialize_by(store_name) 相当の upsert
      const existing = await tx.select({ id: storeCategoryMappings.id }).from(storeCategoryMappings).where(eq(storeCategoryMappings.storeName, normalized)).limit(1);
      if (existing.length > 0) {
        await tx.update(storeCategoryMappings).set({ categoryId: numericCat }).where(eq(storeCategoryMappings.id, existing[0].id));
      } else {
        await tx.insert(storeCategoryMappings).values({ storeName: normalized, categoryId: numericCat });
      }

      // spec §5.6/§13: 同名の未分類取引を事後分類する。取引 store_name は生値のため JS 側で NFKC 比較する
      const unclassified = await tx.select({ id: transactions.id, storeName: transactions.storeName }).from(transactions).where(isNull(transactions.categoryId));
      const targetIds = unclassified.filter((t) => normalizeStoreName(t.storeName) === normalized).map((t) => t.id);
      for (const id of targetIds) {
        await tx.update(transactions).set({ categoryId: numericCat }).where(eq(transactions.id, id));
        await evaluateAlertsForTransaction(tx, id);
      }
      if (targetIds.length > 0) await refreshUnclassifiedAlert(tx);
    });

    revalidatePath("/settings/mappings");
    revalidatePath("/");
    return { errors: [] };
  }

  export async function deleteStoreMapping(input: { id: string }): Promise<ActionResult> {
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const deleted = await db.delete(storeCategoryMappings).where(eq(storeCategoryMappings.id, Number(parsed.data.id))).returning({ id: storeCategoryMappings.id });
    if (deleted.length === 0) return { errors: [`IDが見つかりません: ${input.id}`] };
    revalidatePath("/settings/mappings");
    return { errors: [] };
  }
  ```
- [ ] テストパス確認: `pnpm --filter web exec vitest run src/actions/mappings.test.ts`
- [ ] commit: `git add apps/web/src/actions/mappings.ts apps/web/src/actions/mappings.test.ts && git commit -m "feat(web): add store mapping server actions with NFKC normalization and reclassification"`

---

## Task 10: 通知 Server Actions（`src/actions/notifications.ts`）― 既読化

`mark_notification_as_read` / `mark_all_notifications_as_read` を移植する。

**Files:**
- Create: `apps/web/src/actions/notifications.ts`
- Test: `apps/web/src/actions/notifications.test.ts`（pglite）

**Interfaces:**
- Consumes: `@/db/client`、`@/db/schema` の `notifications`、`next/cache`
- Produces: `markNotificationAsRead({ id })`, `markAllNotificationsAsRead()`（`Promise<ActionResult>`）

**Steps:**
- [ ] テストを先に書く。`apps/web/src/actions/notifications.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
  import { createTestDb } from "@/test/db";
  vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
  // createTestDb() は { db, client, teardown } を返す（計画A提供の戻り値シェイプ）。
  const { db: testDb, teardown } = await createTestDb();
  vi.mock("@/db/client", () => ({ db: testDb }));
  const { unclassifiedAlerts, notifications } = await import("@/db/schema");
  const { markNotificationAsRead, markAllNotificationsAsRead } = await import("./notifications");
  const { isNull } = await import("drizzle-orm");

  afterAll(async () => {
    await teardown();
  });

  beforeEach(async () => { await testDb.delete(notifications); await testDb.delete(unclassifiedAlerts); });

  it("1件既読にする", async () => {
    const [ua] = await testDb.insert(unclassifiedAlerts).values({ count: 1 }).returning();
    const [n] = await testDb.insert(notifications).values({ notifiableType: "UnclassifiedAlert", notifiableId: ua.id }).returning();
    expect((await markNotificationAsRead({ id: String(n.id) })).errors).toEqual([]);
    const rows = await testDb.select().from(notifications);
    expect(rows[0].readAt).not.toBeNull();
  });

  it("全件既読にする", async () => {
    const [ua] = await testDb.insert(unclassifiedAlerts).values({ count: 1 }).returning();
    await testDb.insert(notifications).values([
      { notifiableType: "UnclassifiedAlert", notifiableId: ua.id },
      { notifiableType: "UnclassifiedAlert", notifiableId: ua.id },
    ]);
    expect((await markAllNotificationsAsRead()).errors).toEqual([]);
    expect(await testDb.select().from(notifications).where(isNull(notifications.readAt))).toHaveLength(0);
  });
  ```
- [ ] テスト失敗を確認: `pnpm --filter web exec vitest run src/actions/notifications.test.ts`
- [ ] 実装 `apps/web/src/actions/notifications.ts`:
  ```ts
  "use server";

  import { z } from "zod";
  import { eq, isNull } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { db } from "@/db/client";
  import { notifications } from "@/db/schema";

  export type ActionResult = { errors: string[] };

  const idSchema = z.object({ id: z.string().min(1) });

  export async function markNotificationAsRead(input: { id: string }): Promise<ActionResult> {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
    const updated = await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, Number(parsed.data.id))).returning({ id: notifications.id });
    if (updated.length === 0) return { errors: [`Notification not found: ${input.id}`] };
    revalidatePath("/");
    return { errors: [] };
  }

  export async function markAllNotificationsAsRead(): Promise<ActionResult> {
    await db.update(notifications).set({ readAt: new Date() }).where(isNull(notifications.readAt));
    revalidatePath("/");
    return { errors: [] };
  }
  ```
- [ ] テストパス確認: `pnpm --filter web exec vitest run src/actions/notifications.test.ts`
- [ ] commit: `git add apps/web/src/actions/notifications.ts apps/web/src/actions/notifications.test.ts && git commit -m "feat(web): add notification read server actions"`

---

## Task 11: 認証ロジック（`src/lib/auth.ts`）― Web Crypto HMAC 署名/検証

cookie の署名・検証を純粋関数として実装し、ユニットテストする（spec §7、task item 5）。proxy と login アクションの双方から使う。

**Files:**
- Create: `apps/web/src/lib/auth.ts`
- Test: `apps/web/src/lib/auth.test.ts`

**Interfaces:**
- Produces: `signSession(issuedAtMs: number, secret: string): Promise<string>`（token 文字列）、`verifySession(token: string, secret: string, now?: number): Promise<boolean>`、定数 `AUTH_COOKIE_NAME`、`AUTH_MAX_AGE_SECONDS`
- Consumes: `globalThis.crypto.subtle`（Web Crypto、Node/Edge 双方で利用可能）

**Steps:**
- [ ] テストを先に書く。`apps/web/src/lib/auth.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { signSession, verifySession, AUTH_MAX_AGE_SECONDS } from "./auth";

  const SECRET = "test-secret-key";

  describe("session signing", () => {
    it("署名したトークンは検証を通る", async () => {
      const now = Date.now();
      const token = await signSession(now, SECRET);
      expect(await verifySession(token, SECRET, now)).toBe(true);
    });

    it("改竄されたトークンは拒否する", async () => {
      const token = await signSession(Date.now(), SECRET);
      const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
      expect(await verifySession(tampered, SECRET)).toBe(false);
    });

    it("異なる secret では検証に失敗する", async () => {
      const token = await signSession(Date.now(), SECRET);
      expect(await verifySession(token, "other-secret")).toBe(false);
    });

    it("有効期限切れは拒否する", async () => {
      const issuedAt = Date.now() - (AUTH_MAX_AGE_SECONDS + 10) * 1000;
      const token = await signSession(issuedAt, SECRET);
      expect(await verifySession(token, SECRET)).toBe(false);
    });

    it("不正な形式のトークンは false を返す（throw しない）", async () => {
      expect(await verifySession("garbage", SECRET)).toBe(false);
      expect(await verifySession("", SECRET)).toBe(false);
    });
  });
  ```
- [ ] テスト失敗を確認: `pnpm --filter web exec vitest run src/lib/auth.test.ts`
- [ ] 実装 `apps/web/src/lib/auth.ts`:
  ```ts
  export const AUTH_COOKIE_NAME = "kakeibo_auth";
  export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1年

  // base64url ヘルパ（Edge/Node 双方で使える標準API）
  function toBase64Url(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromBase64Url(s: string): Uint8Array {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function importKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }

  /** issuedAtMs を payload に持つトークン `${payloadB64}.${sigB64}` を生成する */
  export async function signSession(issuedAtMs: number, secret: string): Promise<string> {
    const payload = String(issuedAtMs);
    const payloadBytes = new TextEncoder().encode(payload);
    const key = await importKey(secret);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, payloadBytes));
    return `${toBase64Url(payloadBytes)}.${toBase64Url(sig)}`;
  }

  /** 署名検証 + 有効期限チェック。不正な入力でも例外を投げず false を返す */
  export async function verifySession(token: string, secret: string, now: number = Date.now()): Promise<boolean> {
    try {
      const [payloadB64, sigB64] = token.split(".");
      if (!payloadB64 || !sigB64) return false;
      const payloadBytes = fromBase64Url(payloadB64);
      const sig = fromBase64Url(sigB64);
      const key = await importKey(secret);
      // crypto.subtle.verify は定数時間比較
      const ok = await crypto.subtle.verify("HMAC", key, sig, payloadBytes);
      if (!ok) return false;
      const issuedAt = Number(new TextDecoder().decode(payloadBytes));
      if (!Number.isFinite(issuedAt)) return false;
      return now - issuedAt < AUTH_MAX_AGE_SECONDS * 1000;
    } catch {
      return false;
    }
  }
  ```
- [ ] テストパス確認: `pnpm --filter web exec vitest run src/lib/auth.test.ts`
- [ ] commit: `git add apps/web/src/lib/auth.ts apps/web/src/lib/auth.test.ts && git commit -m "feat(web): add Web Crypto HMAC session signing/verification"`

---

## Task 12: proxy.ts（認証ゲート）+ /login ページ + login アクション

Next.js 16 の `proxy.ts` で `/login` と `/api/inbound-email` 以外を保護し、`/login` で `AUTH_PASSWORD` を照合して署名 cookie を発行する。

**Files:**
- Create: `apps/web/src/proxy.ts`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/actions/auth.ts`

**Interfaces:**
- Consumes: `@/lib/auth` の `verifySession` / `signSession` / `AUTH_COOKIE_NAME` / `AUTH_MAX_AGE_SECONDS`、`next/server` の `NextResponse`、`next/headers` の `cookies`、`next/navigation` の `redirect`
- Produces: proxy デフォルトエクスポート、`login(prevState, formData)` アクション

**Steps:**
- [ ] 実装 `apps/web/src/proxy.ts`（Global Constraint 8: Next 16 は `proxy.ts`。matcher で除外パスを指定。マッチしたルートのみ実行されるが、二重防御として関数内でもパス判定する）:
  ```ts
  import { NextResponse } from "next/server";
  import type { NextRequest } from "next/server";
  import { AUTH_COOKIE_NAME, verifySession } from "@/lib/auth";

  export async function proxy(request: NextRequest) {
    const secret = process.env.AUTH_COOKIE_SECRET ?? "";
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? "";
    const authed = token !== "" && secret !== "" && (await verifySession(token, secret));
    if (authed) return NextResponse.next();

    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  export const config = {
    // /login, /api/inbound-email, Next 内部・静的ファイルを除外（spec §7）
    matcher: ["/((?!login|api/inbound-email|_next/static|_next/image|favicon.ico).*)"],
  };
  ```
  注: Proxy は Next 16 では既定 Node.js ランタイム。`runtime` を指定するとエラーになるため設定しない（proxy.md 参照）。Server Function は使用ルートへの POST として扱われ、除外パス上の Server Function もスキップされる（proxy.md 補足）。ログインアクションは `/login` に属するので未認証で呼べる。
- [ ] 実装 login アクション `apps/web/src/actions/auth.ts`:
  ```ts
  "use server";

  import { cookies } from "next/headers";
  import { redirect } from "next/navigation";
  import { AUTH_COOKIE_NAME, AUTH_MAX_AGE_SECONDS, signSession } from "@/lib/auth";

  export type LoginState = { error: string | null };

  export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
    const password = String(formData.get("password") ?? "");
    const expected = process.env.AUTH_PASSWORD ?? "";
    const secret = process.env.AUTH_COOKIE_SECRET ?? "";

    if (expected === "" || secret === "") {
      return { error: "サーバーの認証設定が未構成です" };
    }
    if (password !== expected) {
      return { error: "パスワードが違います" };
    }

    const token = await signSession(Date.now(), secret);
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_MAX_AGE_SECONDS,
    });
    redirect("/");
  }
  ```
- [ ] 実装 `/login` ページ `apps/web/src/app/login/page.tsx`（`useActionState` でエラー表示。forms.md 参照）:
  ```tsx
  "use client";

  import { useActionState } from "react";
  import { login, type LoginState } from "@/actions/auth";

  const initialState: LoginState = { error: null };

  export default function LoginPage() {
    const [state, formAction, pending] = useActionState(login, initialState);

    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-xs px-4 flex flex-col gap-6">
          <header className="text-center">
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">かけいぼ</p>
            <h1 className="text-2xl font-bold text-foreground mt-1">ログイン</h1>
          </header>
          <form action={formAction} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">パスワード</span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full px-3.5 py-3 rounded-xl border border-border bg-muted/30 text-foreground text-sm focus:outline-none focus:border-foreground/25 focus:bg-background transition-colors"
              />
            </label>
            {state.error && (
              <p className="text-xs text-rose-500" aria-live="polite">{state.error}</p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="w-full py-3.5 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {pending ? "確認中..." : "ログイン"}
            </button>
          </form>
        </div>
      </main>
    );
  }
  ```
  注: `/login` はグローバルな `AppShell`（BottomNav）が layout に含まれるため下部ナビが表示される。許容範囲だが、気になる場合は後続で route group による分離を検討（本計画では対象外）。
- [ ] 動作確認（手動）: `pnpm --filter web exec tsc --noEmit`（型が通ること。RSC/proxy のビルド確認は Task 13 完了後に `pnpm --filter web build` で行う）
- [ ] commit: `git add apps/web/src/proxy.ts apps/web/src/actions/auth.ts apps/web/src/app/login/page.tsx && git commit -m "feat(web): add password auth via proxy, login page and action"`

---

## Task 13: 画面データ層の差し替え（RSC ページ + クライアントコンポーネント）

各ページの Apollo/GraphQL を Task 3・4 のローダと Task 5〜10 のアクションへ差し替える。UI の見た目・構造は不変。以下は現物のコードに基づく before/after 断片。

**Files（Modify）:**
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/calendar/[year]/[month]/page.tsx`
- `apps/web/src/app/transactions/[year]/[month]/page.tsx`
- `apps/web/src/app/settings/page.tsx`
- `apps/web/src/app/settings/alerts/page.tsx`
- `apps/web/src/app/settings/categories/page.tsx`
- `apps/web/src/app/settings/mappings/page.tsx`
- `apps/web/src/components/notification-list.tsx`
- `apps/web/src/components/budget-list.tsx`
- `apps/web/src/components/transaction-form-sheet.tsx`
- `apps/web/src/components/alert-settings-content.tsx`
- `apps/web/src/components/category-management-content.tsx`
- `apps/web/src/components/mapping-management-content.tsx`

**Interfaces:** Consumes Task 3/4 ローダ、Task 5〜10 アクション、`@/lib/notifications` 型。`apps/web/src/components/providers.tsx` と `apps/web/src/app/layout.tsx` は本タスクでは触らない（13n 参照。計画C Task 4 の担当）。

### 13a. ホーム `src/app/page.tsx`

- [ ] 全面置換（GraphQL → ローダ）。`before` は現行1-103行。`after`:
  ```tsx
  import { db } from "@/db/client";
  import { loadMonthlySummaryView, loadRecentTransactions } from "@/lib/queries";
  import { loadUnreadNotifications } from "@/lib/notifications";
  import { jstToday, jstDateParts, jstDaysInMonth, jstDayOfMonth } from "@/lib/dates";
  import { SummaryCard } from "@/components/summary-card";
  import { BudgetList } from "@/components/budget-list";
  import { RecentTransactions } from "@/components/recent-transactions";
  import { NotificationList } from "@/components/notification-list";

  export default async function Home() {
    const today = jstToday(); // 絶対時刻（実行環境TZに依存する生の Date）
    // year/month は必ず jstDateParts で取り出す。today.getFullYear()/getMonth() は
    // 実行環境TZ（Vercel=UTC）に引きずられるため使わない（Global Constraint 5, spec 移行H3）。
    const { year, month } = jstDateParts(today);

    const [monthlySummary, transactions, notifications] = await Promise.all([
      loadMonthlySummaryView(db, year, month),
      loadRecentTransactions(db, 5),
      loadUnreadNotifications(db, 5),
    ]);

    // 今月の経過率（理想ペースライン位置）。JST基準で算出する
    const daysInMonth = jstDaysInMonth(year, month);
    const idealPacePercent = Math.round((jstDayOfMonth(today) / daysInMonth) * 100);

    return (
      <main className="min-h-screen">
        <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
          <header>
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              {year}年{month}月
            </p>
            <h1 className="text-2xl font-bold text-foreground mt-1">かけいぼ</h1>
          </header>
          {notifications.length > 0 && <NotificationList notifications={notifications} />}
          <SummaryCard
            totalAmount={monthlySummary.totalAmount}
            budgetAmount={monthlySummary.budgetAmount}
            remainingAmount={monthlySummary.remainingAmount}
          />
          <BudgetList breakdowns={monthlySummary.categoryBreakdowns} idealPacePercent={idealPacePercent} />
          <RecentTransactions transactions={transactions} />
        </div>
      </main>
    );
  }
  ```
  注: `jstToday()` は生の現在時刻（`new Date()`）を返す（計画A T3 仕様）。JST の年月日は必ず `jstDateParts(today)` で取り出し、`Date#getFullYear()`/`Date#getMonth()` を直接呼ばない（Vercel の実行環境TZはUTCのため、日付をまたぐ時間帯に月がずれる）。

### 13b. カレンダー `src/app/calendar/[year]/[month]/page.tsx`

- [ ] before（1-27行のimport/GraphQL、61-69行のfetch）を置換。`after` の要点:
  - 先頭を `import { db } from "@/db/client";` `import { loadTransactionsByMonth, loadMonthlySummaryView } from "@/lib/queries";` に変更、`query`/`gql` の import と `CALENDAR_PAGE_QUERY`・`QueryResult` 型を削除。
  - fetch部（61-69行）:
    ```tsx
    const [transactions, summary] = await Promise.all([
      loadTransactionsByMonth(db, year, month),
      loadMonthlySummaryView(db, year, month),
    ]);
    const budgetAmount = summary.budgetAmount;
    ```
  - `transactions` は既に整形済み配列なので `.nodes` フィルタ処理を削除。`Transaction` ローカル型は `loadTransactionsByMonth` の戻り型と一致するため残置可。以降の JSX（71-94行）は不変。
  - `redirect` の未来月判定（50-59行）は JST 基準へ寄せるため `const now = new Date();` を `import { jstToday } from "@/lib/dates"; const now = jstToday();` に変更（任意だが Global Constraint 5 の一貫性のため推奨）。

### 13c. 支出一覧 `src/app/transactions/[year]/[month]/page.tsx`

- [ ] before（1-8, 10-41, 65-83行）を置換:
  - import を `import { db } from "@/db/client";` `import { loadTransactionsByMonth, loadMonthlySummaryView } from "@/lib/queries";` に。`query/gql/TransactionsPageQuery` と `TRANSACTIONS_PAGE_QUERY` を削除。`Transaction` 型は `loadTransactionsByMonth` の要素型に置換。
  - fetch:
    ```tsx
    const [transactions, monthlySummary] = await Promise.all([
      loadTransactionsByMonth(db, year, month),
      loadMonthlySummaryView(db, year, month),
    ]);
    ```
  - `idealPacePercent` 計算（78-83行）は JST へ寄せる（`jstToday`/`jstDaysInMonth`/`jstDayOfMonth` 使用、13a と同様）。JSX は不変。
  - 「今日」の year/month を使う箇所（存在する場合）は 13a と同様に `jstDateParts(jstToday())` で取得し、`Date#getFullYear()`/`Date#getMonth()` を直接呼ばない（Global Constraint 5, spec 移行H3）。

### 13d. 設定トップ `src/app/settings/page.tsx`

- [ ] `SETTINGS_SECTIONS` から "メール通知" 項目（31-36行）を削除。`Mail` の import（1行目）も削除。他は不変（Global Constraint 9）。
  **本タスク（B T13d）がこの削除の唯一の所有者。計画C はこの削除を実施しない（C 側は「削除済みであることの確認のみ」を行う。もし B が本タスクを未実施のまま C の当該タスクに到達したら、C 側で削除を行わず中断して本タスクへ差し戻す）。**

### 13e. アラート設定 `src/app/settings/alerts/page.tsx`

- [ ] before（1-67行）を置換:
  - import を `import { db } from "@/db/client";` `import { loadAlertSettingsView } from "@/lib/queries";` `import { loadCategories } from "@/lib/queries";`（1ファイルにまとめる）に。`query/gql/ALERT_SETTINGS_PAGE_QUERY/AlertSettingsPageData` を削除。
  - fetch:
    ```tsx
    const [alertSettings, categories] = await Promise.all([
      loadAlertSettingsView(db),
      loadCategories(db),
    ]);
    ```
  - `AlertSettingsContent` へ `budgetAlertSettings={alertSettings.budgetAlertSettings} paceAlertSettings={alertSettings.paceAlertSettings} categories={categories}` を渡す（categories は `{id,name}` を含むので互換）。JSX 構造は不変。

### 13f. カテゴリ管理 `src/app/settings/categories/page.tsx`

- [ ] before（1-41行）を置換:
  - import を `import { db } from "@/db/client";` `import { loadCategories } from "@/lib/queries";` に。`query/gql/CATEGORIES_PAGE_QUERY/CategoryData/CategoriesPageData` 削除。
  - fetch: `const categories = await loadCategories(db);`
  - `<CategoryManagementContent initialCategories={categories} />`（`loadCategories` は `{id,name,kind,color}` を返す）。

### 13g. マッピング管理 `src/app/settings/mappings/page.tsx`

- [ ] before（1-45行）を置換:
  - import を `import { db } from "@/db/client";` `import { loadStoreMappings, loadCategoryOptions } from "@/lib/queries";` に。`query/gql/MAPPINGS_PAGE_QUERY/StoreMapping/CategoryData/MappingsPageData` 削除。
  - fetch:
    ```tsx
    const [mappings, categories] = await Promise.all([
      loadStoreMappings(db),
      loadCategoryOptions(db),
    ]);
    ```
  - `<MappingManagementContent initialMappings={mappings} initialCategories={categories} />`。

### 13h. 通知UI `src/components/notification-list.tsx`（spec §8.1）

- [ ] 型と分岐を差し替える。`before` 11-34行の型定義を、`@/lib/notifications` の型を使う形へ:
  ```tsx
  import type { NotificationView, Notifiable } from "@/lib/notifications";

  type NotificationItem = NotificationView;
  type Props = { notifications: NotificationItem[] };
  ```
  （既存の `BudgetAlertNotifiable` 等ローカル型定義 11-34行を削除）
- [ ] `NotificationRow`（40-76行）の分岐末尾に `InboundEmail` を追加し、フォールスルーを `UnclassifiedAlert` 明示チェックに変更:
  ```tsx
  function NotificationRow({ item }: { item: NotificationItem }) {
    const { notifiable } = item;

    if (notifiable.__typename === "BudgetAlert") {
      return (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            <span className="font-medium">{notifiable.category.name}</span> の予算が{" "}
            <span className="font-medium">{notifiable.usagePercent}%</span> に達しました
            （閾値: {notifiable.threshold}%）
          </AlertDescription>
        </Alert>
      );
    }

    if (notifiable.__typename === "PaceAlert") {
      return (
        <Alert className={cn("border-amber-300 bg-amber-50 text-amber-800", "*:[svg]:text-amber-600")}>
          <TrendingUp />
          <AlertDescription className="text-amber-700">
            <span className="font-medium">{notifiable.category.name}</span> のペースが想定を超えています
          </AlertDescription>
        </Alert>
      );
    }

    if (notifiable.__typename === "InboundEmail") {
      return (
        <Alert variant="destructive">
          <MailWarning />
          <AlertDescription>
            メールの取り込みに失敗しました
            {notifiable.subject ? <>（{notifiable.subject}）</> : null}
            {notifiable.errorMessage ? <span className="block text-xs opacity-80">{notifiable.errorMessage}</span> : null}
          </AlertDescription>
        </Alert>
      );
    }

    // UnclassifiedAlert（網羅性のため明示チェック）
    if (notifiable.__typename === "UnclassifiedAlert") {
      return (
        <Alert>
          <Tag />
          <AlertDescription>
            未分類の支出が <span className="font-medium">{notifiable.count}件</span> あります
          </AlertDescription>
        </Alert>
      );
    }

    // 想定外の notifiable_type は開発時に気づけるよう never チェック
    return null;
  }
  ```
- [ ] 1行目の lucide import に `MailWarning` を追加: `import { CircleAlert, Tag, TrendingUp, MailWarning } from "lucide-react";`

### 13i. 予算リスト `src/components/budget-list.tsx`（gql依存除去）

- [ ] 5行目 `import { PaceStatus } from "@/gql/graphql";` を削除し、ローカル定義に置換:
  ```tsx
  // gql 由来の PaceStatus enum をローカルの文字列 union に置換
  type PaceStatus = "GREEN" | "YELLOW" | "RED";
  ```
- [ ] `CategoryBreakdown.paceStatus` の型は `PaceStatus | null | undefined` のままで互換（ローダは `"GREEN"|"YELLOW"|"RED"|null` を渡す）。
- [ ] `paceConfig` / `paceIndicatorClass`（23-33行）の `[PaceStatus.Green]` 等の computed key を文字列キーへ置換:
  ```tsx
  const paceConfig: Record<PaceStatus, { label: string; className: string }> = {
    GREEN:  { label: "順調", className: "bg-emerald-50 text-emerald-700 border-transparent" },
    YELLOW: { label: "注意", className: "bg-amber-50 text-amber-700 border-transparent" },
    RED:    { label: "超過", className: "bg-red-50 text-red-600 border-transparent" },
  };
  const paceIndicatorClass: Record<PaceStatus, string> = {
    GREEN:  "bg-emerald-400",
    YELLOW: "bg-amber-400",
    RED:    "bg-red-400",
  };
  ```
  以降の JSX（`b.paceStatus ? paceConfig[b.paceStatus] : null`）は不変。

### 13j. 取引フォーム `src/components/transaction-form-sheet.tsx`（gql → Server Actions）

- [ ] import 群（1-17行）を置換:
  ```tsx
  "use client";

  import { useState, useEffect } from "react";
  import { useRouter } from "next/navigation";
  import { Dialog } from "@base-ui/react/dialog";
  import { X, Trash2 } from "lucide-react";
  import { createTransaction, updateTransaction, deleteTransaction } from "@/actions/transactions";
  import { getCategoryOptions } from "@/actions/categories";
  ```
  （`useMutation/useQuery/gql/TransactionSource/生成型` を全削除。`CATEGORIES_QUERY/CREATE_TRANSACTION/UPDATE_TRANSACTION/DELETE_TRANSACTION` の gql 定数 19-58行も削除）
- [ ] `FormContent` 内のカテゴリ取得（118-119行 `useQuery`）を Server Action + useEffect に置換:
  ```tsx
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    let active = true;
    getCategoryOptions().then((cats) => { if (active) setCategories(cats); });
    return () => { active = false; };
  }, []);
  ```
  `Category` 型はローカル定義（68-72行）をそのまま利用（`{id,name,color}` 互換）。
- [ ] mutation フック（121-134行）を削除し、`loading` を自前 state に:
  ```tsx
  const [submitting, setSubmitting] = useState(false);
  const [deletingState, setDeletingState] = useState(false);
  const loading = submitting || deletingState;
  ```
  （JSX の `creating/updating/deleting` 参照は `submitting`/`deletingState` に読み替え。具体的には 317行 `disabled={loading}`、347行 `disabled={deleting}` → `disabled={deletingState}`、320・350行のラベル分岐は `loading`/`deletingState` を使う）
- [ ] `handleSubmit`（136-188行）を置換:
  ```tsx
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrors(["金額は1以上の数値を入力してください"]);
      return;
    }
    setSubmitting(true);
    try {
      const result = isEdit && transaction
        ? await updateTransaction({ id: transaction.id, storeName: storeName.trim(), amount: parsedAmount, purchasedAt, categoryId: categoryId || null })
        : await createTransaction({ storeName: storeName.trim(), amount: parsedAmount, purchasedAt, categoryId: categoryId || null });
      if (result.errors.length > 0) { setErrors(result.errors); return; }
      router.refresh();
      onClose();
    } catch {
      setErrors(["エラーが発生しました"]);
    } finally {
      setSubmitting(false);
    }
  };
  ```
- [ ] `handleDelete`（190-206行）を置換:
  ```tsx
  const handleDelete = async () => {
    if (!transaction) return;
    setDeletingState(true);
    try {
      const result = await deleteTransaction({ id: transaction.id });
      if (result.errors.length > 0) { setErrors(result.errors); return; }
      router.refresh();
      onClose();
    } catch {
      setErrors(["削除に失敗しました"]);
    } finally {
      setDeletingState(false);
    }
  };
  ```
  注: `source` はサーバー側で `'manual'` 固定のためクライアントから送らない。

### 13k. アラート設定コンテンツ `src/components/alert-settings-content.tsx`（gql → Server Actions）

- [ ] import（1-11行）を置換:
  ```tsx
  "use client";

  import { useState } from "react";
  import { upsertBudgetAlertSetting, upsertPaceAlertSetting } from "@/actions/alert-settings";
  import { Card, CardContent } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { ToggleSwitch } from "@/components/ui/toggle-switch";
  import { Check, Loader2 } from "lucide-react";
  import { cn } from "@/lib/utils";
  ```
  （`useMutation/gql/AlertSettingKind` と `UpsertAlertSettingData`型・`UPSERT_ALERT_SETTING` gql 13-49行、`useEffect/useRef` を削除。`mountedRef` は不要になる）
- [ ] `BudgetAlertRow.handleSave`（106-138行）を置換（`useMutation` 撤去、`mountedRef` 撤去）:
  ```tsx
  const [status, setStatus] = useState<SaveStatus>("idle");

  async function handleSave() {
    const t1 = parseInt(threshold, 10);
    const t2 = threshold2.trim() !== "" ? parseInt(threshold2, 10) : null;
    if (isNaN(t1) || t1 < 1 || t1 > 200) { setStatus("invalid"); return; }
    if (t2 !== null && (isNaN(t2) || t2 < 1 || t2 > 200)) { setStatus("invalid"); return; }
    if (t2 !== null && t2 <= t1) { setStatus("invalid"); return; }

    setStatus("saving");
    const result = await upsertBudgetAlertSetting({ categoryId, threshold: t1, threshold2: t2, isActive });
    setStatus(result.errors.length > 0 ? "error" : "saved");
    setTimeout(() => setStatus("idle"), 2000);
  }
  ```
  （`mountedRef`/`useEffect` の 103-104行と対応 import を削除）
- [ ] `PaceAlertRow.handleSave`（226-255行）を同様に置換:
  ```tsx
  async function handleSave() {
    const t = parseInt(threshold, 10);
    const day = parseInt(activeFromDay, 10);
    if (isNaN(t) || t < 101 || t > 500) { setStatus("invalid"); return; }
    if (isNaN(day) || day < 1 || day > 28) { setStatus("invalid"); return; }

    setStatus("saving");
    const result = await upsertPaceAlertSetting({ categoryId: category.id, threshold: t, activeFromDay: day, isActive });
    setStatus(result.errors.length > 0 ? "error" : "saved");
    setTimeout(() => setStatus("idle"), 2000);
  }
  ```
  JSX（Card/入力/ボタン）は不変。`onClick={handleSave}` は async 関数でも動作する。

### 13l. カテゴリ管理コンテンツ `src/components/category-management-content.tsx`（gql → Server Actions、kind化）

- [ ] import（1-9行）を置換し、Apollo を撤去、`useRouter` を追加:
  ```tsx
  "use client";

  import { useState } from "react";
  import { useRouter } from "next/navigation";
  import { createCategory, updateCategory, deleteCategory } from "@/actions/categories";
  import { Card, CardContent } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Plus, Pencil, Trash2, X, Check, Loader2 } from "lucide-react";
  import { cn } from "@/lib/utils";
  ```
  （gql 定数 14-67行、`useQuery`、`Create/Update/DeleteCategoryData` 型 80-90行を削除）
- [ ] 型 `Category`（72-78行）を kind 化し children を除去:
  ```tsx
  type Category = { id: string; name: string; kind: "fixed" | "variable"; color?: string | null };
  ```
- [ ] `CATEGORY_TYPES`（92-95行）を kind 値へ:
  ```tsx
  const CATEGORY_TYPES: { value: "fixed" | "variable"; label: string }[] = [
    { value: "fixed", label: "固定費" },
    { value: "variable", label: "変動費" },
  ];
  ```
- [ ] `AddCategoryForm`（106-197行）: `useMutation` を Server Action に置換。`categoryType` state 初期値を `"variable"` に。送信を `createCategory` に。成功時 `router.refresh()`:
  ```tsx
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
    // ...JSX: CATEGORY_TYPES.map の onClick を setKind(t.value)、比較を kind === t.value に置換
  }
  ```
  （JSX 内 151-165行の `categoryType`→`kind`、`setCategoryType`→`setKind`）
- [ ] `CategoryRow`（202-319行）: `useMutation` 2つを Server Action に置換、`router.refresh()` を成功時に呼ぶ。`typeLabel`（235行）を kind ベースに:
  ```tsx
  const typeLabel = category.kind === "fixed" ? "固定費" : "変動費";
  ```
  update ハンドラ:
  ```tsx
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("カテゴリ名を入力してください"); return; }
    setError(null); setUpdating(true);
    const result = await updateCategory({ id: category.id, name: name.trim(), color });
    setUpdating(false);
    if (result.errors.length > 0) { setError(result.errors.join(", ")); return; }
    setEditing(false); router.refresh();
  }
  async function handleRemove() {
    setDeleting(true);
    const result = await deleteCategory({ id: category.id });
    setDeleting(false);
    if (result.errors.length > 0) { setError(result.errors.join(", ")); return; }
    router.refresh();
  }
  ```
  （削除ボタン 298行 `onClick={() => remove(...)}` を `onClick={handleRemove}` に）
- [ ] メイン `CategoryManagementContent`（324-392行）: `InitialCategory` 型を kind 化、`useQuery` 撤去、props を直接使用、フィルタを kind ベースに:
  ```tsx
  type InitialCategory = { id: string; name: string; kind: "fixed" | "variable"; color?: string | null };

  export function CategoryManagementContent({ initialCategories }: { initialCategories: InitialCategory[] }) {
    const [adding, setAdding] = useState(false);
    const categories = initialCategories; // RSC が revalidate 後の最新を渡す
    const fixed = categories.filter((c) => c.kind === "fixed");
    const variable = categories.filter((c) => c.kind === "variable");
    // ...JSX 不変
  }
  ```

### 13m. マッピング管理コンテンツ `src/components/mapping-management-content.tsx`（gql → Server Actions）

- [ ] import（1-9行）を置換:
  ```tsx
  "use client";

  import { useState } from "react";
  import { useRouter } from "next/navigation";
  import { upsertStoreMapping, deleteStoreMapping } from "@/actions/mappings";
  import { Button } from "@/components/ui/button";
  import { Card, CardContent } from "@/components/ui/card";
  import { Plus, Pencil, Trash2, X, Check, Loader2 } from "lucide-react";
  import { cn } from "@/lib/utils";
  ```
  （gql 定数 14-60行、`Update/DeleteStoreMappingData` 型 72-78行、`useQuery/useMutation` 撤去）
- [ ] `AddMappingForm`（85-154行）: `useMutation` を `upsertStoreMapping` に置換、成功時 `router.refresh()`:
  ```tsx
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeName.trim()) { setError("店名を入力してください"); return; }
    if (!categoryId) { setError("カテゴリを選択してください"); return; }
    setError(null); setLoading(true);
    const result = await upsertStoreMapping({ storeName: storeName.trim(), categoryId });
    setLoading(false);
    if (result.errors.length > 0) { setError(result.errors.join(", ")); return; }
    router.refresh(); onDone();
  }
  ```
- [ ] 新規フォームの説明文（121行）「iPhoneショートカットの送信値と一致」→「メール取り込み時の店名と一致」に更新（iPhoneショートカット廃止のため。spec §2.2）。
- [ ] `MappingRow`（159-280行）: update/remove を Server Action に置換、`router.refresh()`:
  ```tsx
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function handleUpdate() {
    setUpdating(true);
    const result = await upsertStoreMapping({ storeName: mapping.storeName, categoryId });
    setUpdating(false);
    if (result.errors.length > 0) { setError(result.errors.join(", ")); return; }
    setEditing(false); router.refresh();
  }
  async function handleRemove() {
    setDeleting(true);
    const result = await deleteStoreMapping({ id: mapping.id });
    setDeleting(false);
    if (result.errors.length > 0) { setError(result.errors.join(", ")); return; }
    router.refresh();
  }
  ```
  （221行の編集保存 onClick を `handleUpdate`、247行の削除 onClick を `handleRemove` に）
- [ ] メイン（290-335行）: `useQuery` 撤去、props 直接使用:
  ```tsx
  export function MappingManagementContent({ initialMappings, initialCategories }: Props) {
    const [adding, setAdding] = useState(false);
    const mappings = initialMappings;
    const categories = initialCategories;
    // ...JSX 不変
  }
  ```
  管理画面上部の説明文（303行）の「iPhoneショートカットから送信された店名」→「メール取り込み時の店名」に更新。

### 13n. Providers / layout（触らない）

- [ ] `src/components/providers.tsx` は本タスクでは変更しない。計画C Task 4 がファイルごと削除し `layout.tsx` から `<Providers>` ラップを除去するため、ここでパススルー書き換えを行うと二度手間になる（クロスレビュー指摘 L3）。`layout.tsx` は現状の `<Providers>` ラップのまま残置してよい。`app-shell.tsx` は `TransactionFormSheet` を使うのみで gql 非依存になったため変更不要。

### 検証（Task 13 全体）

- [ ] 型チェック: `pnpm --filter web exec tsc --noEmit`。`apps/web/src/components/providers.tsx` と `apps/web/src/app/layout.tsx`（いずれも 13n により本タスクでは未変更・計画C Task 4 の担当）を除き、`@/gql`・`@/lib/apollo-client`・`@/lib/config`（GRAPHQL_URL）・`@apollo/*` への参照が全て消えていること（残っていれば該当箇所を修正。ただし `src/gql`・`apollo-client.ts`・`config.ts`・`providers.tsx` ファイル自体の削除は計画C担当のため本計画では削除しない＝未参照で残す）。
- [ ] 全テスト: `pnpm --filter web exec vitest run`（Task 1〜11 の全テストが緑）。
- [ ] ビルド確認: `pnpm --filter web build`（RSC・proxy・Server Actions がビルドを通ること。DB接続を要する RSC は build 時に評価されうるため、`AUTH_*`/`DATABASE_URL` などの env が無い環境では `next build` が該当ページの静的評価で失敗する可能性がある。その場合は各データ取得ページが動的である（`cookies()`/`revalidatePath` 依存で dynamic 化）ことを確認し、必要なら `export const dynamic = "force-dynamic";` を各データ取得ページ先頭に付す）。
- [ ] commit: `git add -A apps/web/src && git commit -m "feat(web): swap all screen data layers from GraphQL to Drizzle loaders and server actions"`

---

## セルフレビュー結果（spec 網羅・プレースホルダ・型整合の確認済み）

- **spec §4 フェーズ4（Server Actions + 画面差し替え）**: transactions/categories/budgets/alert-settings/mappings/notifications の6アクション（Task 5-10）と全7画面 + 通知UI + kind定数 + gql依存除去（Task 13）を網羅。
- **spec §6 フェーズ6（認証）**: auth.ts + proxy.ts + /login + login アクション + 署名検証ユニットテスト（Task 11-12）を網羅。
- **spec §5.5（同期実行）**: transactions アクションが insert/update/delete と alerts 判定を同一 `db.transaction` 内で実行（Task 5）。mappings 再分類も同トランザクション（Task 9）。
- **spec §5.6/§13（未分類再計算漏れ）**: transactions 全経路 + mappings 再分類で `refreshUnclassifiedAlert` を呼ぶ（Task 5, 9）。categories は削除時に参照ありなら拒否のため未分類件数に影響なし（対応不要を明記）。
- **spec §8.1（通知 union）**: RSC ローダ（Task 4）+ InboundEmail 分岐追加・UnclassifiedアルートをUnclassifiedAlert明示チェック化（Task 13h）。
- **spec §4.1（kind化）**: UI 定数・比較・型を `'fixed'/'variable'` に（Task 13f, 13i, 13k）。
- **spec §3.2（JST）**: `serialize.ts` + `dates.ts` 利用で日付演算を JST 固定（Task 1, 13a-c）。
- **spec §7（proxy 除外パス・Web Crypto・cookie属性）**: matcher で `/login`・`/api/inbound-email` 除外、HMAC-SHA256、httpOnly/secure/sameSite=lax/1年（Task 11-12）。
- **計画Aインターフェース整合**: `db`/schema テーブル/`DbTransaction`/`evaluateAlertsForTransaction(tx, id)`/`refreshUnclassifiedAlert(tx)`/`getMonthlySummary(db,y,m)`/`jstMonthRange`/`jstToday` 等を consume のみ。命名・casing の前提差異は Global Constraints 2-3 に集約し、影響をローダ/アクションに局所化。
- **プレースホルダ無し**: 全新規ファイルは実コード全文。既存編集は現物の行番号付き before と完全な after 断片を提示。
- **Next.js 16 差異対応**: `middleware.ts`→`proxy.ts`、`cookies()` async、`useActionState` を bundled docs で確認済み（Task 12 参照）。
