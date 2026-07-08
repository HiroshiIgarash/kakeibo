# [Migration A: Foundation] Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rails → Next.js 移行の基盤（Drizzle 導入・DBスキーマ・JST日付ユーティリティ・pglite/vitest テスト基盤・純粋ロジック4本・設定移行スクリプト）を `apps/web` 内に構築し、後続の計画B/C が参照する固定インターフェースを確定させる。

**Architecture:** `apps/web/src/db` に Drizzle スキーマと Supabase(postgres-js) クライアントを置く。`apps/web/src/lib` に DB 非依存の純粋関数（`dates`・`budget-pace`・`email-parser`）と、Drizzle executor を引数で受け取る関数（`monthly-summary`・`alerts`）を置く。テストは vitest + `@electric-sql/pglite`（インメモリ PostgreSQL）で、テスト毎に Drizzle 生成マイグレーションを適用して実行する。数式・状態遷移は現行 Rails 実装（`apps/api/app/services`・`apps/api/app/jobs`）から変更しない。

**Tech Stack:** TypeScript, Next.js 16, Drizzle ORM, postgres-js, @electric-sql/pglite, Vitest, pnpm(workspace), Node 26（ネイティブ TS 実行）。

## Global Constraints

- パッケージマネージャは **pnpm**（リポジトリ root に `pnpm-workspace.yaml` あり、`apps/web` は workspace の `web` フィルタ）。依存追加は `pnpm --filter web add ...`、コマンド実行は `pnpm --filter web exec ...` / `pnpm --filter web run ...`。`apps/web/package-lock.json` は npm の残骸なので新規に触らない（削除は掃除フェーズの範囲外）。
- 日付・月境界・経過日数の演算は **すべて Asia/Tokyo 固定**。実行環境TZ（Vercel は UTC）に依存させない。ビジネスロジックは `src/lib/dates.ts` の関数群のみを使い、`new Date()` の素の比較や `Date#getMonth()` を直接使わない。JST は UTC+9 固定（DST なし）として UTC 時刻に手計算でオフセットする実装。
- DB の timestamp 系カラムは全て `timestamptz`（`{ withTimezone: true }`）。DB には UTC 絶対時刻で保存し、TZ 解釈はアプリ層のみ。
- アプリ実行時の DB 接続（`src/db/client.ts`）は Supabase transaction-mode pooler（port 6543, `DATABASE_URL`）に対し **`prepare: false` 必須**。drizzle-kit の DDL は `DIRECT_URL`（port 5432 直結）を使う。
- 丸め規則（spec §5.7）: `daily_amount` は `Math.floor`（`Math.trunc` 禁止）。`usage_rate`/`percentage` の小数第1位四捨五入は `Math.round(x * 10) / 10`（対象は非負のみ）。整数カラムへ格納する `usage_percent` は Ruby の AR 整数キャスト（0方向切り捨て）に合わせ `Math.trunc`。
- コメント・コミット本文は通常の日本語（原始人モード等にしない）。コミットは Conventional Commits。
- TDD 厳守: 失敗するテスト → 失敗確認 → 最小実装 → パス確認 → commit。純粋ロジックはユニットテスト、DB を伴うものは pglite integration test。
- **固定インターフェース（計画B/C と共有・変更禁止）**:
  - `src/db/client.ts`: `export const db`（drizzle instance）
  - `src/db/schema.ts`: spec §4 の全テーブルを camelCase export（`transactions, categories, budgets, budgetAlertSettings, budgetAlerts, paceAlertSettings, paceAlerts, storeCategoryMappings, unclassifiedAlerts, notifications, inboundEmails`）+ 型 `Db` / `DbTransaction` を export
  - `src/lib/email-parser.ts`: `parseSmbcEmail(input: {from: string; subject: string; plain: string}): ParseResult`
  - `src/lib/budget-pace.ts`: `calcBudgetPace(input: {budgetAmount: number; spentAmount: number; date: Date}): BudgetPace`
  - `src/lib/alerts.ts`: `evaluateAlertsForTransaction(tx: DbTransaction, transactionId: number): Promise<void>` / `refreshUnclassifiedAlert(tx: DbTransaction): Promise<void>`
  - `src/lib/monthly-summary.ts`: `getMonthlySummary(db: Db, year: number, month: number): Promise<MonthlySummary>`
  - `src/lib/dates.ts`: `jstToday()` / `jstMonthRange(year, month)` / `jstDaysInMonth(year, month)` / `jstDayOfMonth(date)`（+ 補助 `jstDateParts` / `jstEndOfDay` / `monthKey` / `jstMonthKey`）

> **fixture に関する重要事項（実測済み）**: `docs/superpowers/specs/fixtures/*.eml` の `text/plain` パートは ISO-2022-JP だが、**ESC(0x1B) 制御バイトが欠落**している（`$B` / `(B` などの指示シーケンスは残るが先頭 ESC が無い）。そのため CloudMailin の `plain`（デコード済み UTF-8）相当を再構築するには、テストヘルパ側で `$B`/`$@`/`(B`/`(J`/`(I` の直前に ESC を再挿入 → `TextDecoder('iso-2022-jp')` でデコード → 残存 `U+FFFD` を除去、という前処理を行う（本番パーサーはクリーンな `plain` を受け取る前提なのでこの前処理はテストヘルパにのみ置く）。またサンプル本文のラベルは spec §6.1 が想定する「ご利用日/ご利用先/ご利用金額」ではなく **「利用日/利用先/利用金額」（`ご` 無し）** である。パーサー正規表現は spec の正規表現を包含しつつ実 fixture でも通るよう `(?:ご)?` を先頭に付ける（spec の想定を壊さない上位互換）。この2点は実 fixture のバイト列を Node で検証済み。

---

### Task 1: ツール・依存導入と設定ファイル

**Files:**
- Modify: `apps/web/package.json`（scripts 追加）
- Create: `apps/web/drizzle.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/.env.example`

**Interfaces:**
- Produces: pnpm scripts `test` / `test:watch` / `db:generate` / `db:migrate`。drizzle-kit 設定（schema=`./src/db/schema.ts`, out=`./drizzle`, dialect=postgresql, DDL は `DIRECT_URL`）。vitest 設定（node 環境, `src/**/*.test.ts`）。
- Consumes: なし。

**Steps:**

- [ ] 依存追加（runtime）: 実行 `pnpm --filter web add drizzle-orm postgres`
- [ ] 依存追加（dev）: 実行 `pnpm --filter web add -D drizzle-kit @electric-sql/pglite vitest`
- [ ] `apps/web/drizzle.config.ts` を作成:
  ```ts
  import { defineConfig } from "drizzle-kit";

  // DDL（generate/migrate）は Supabase 直結（port 5432）の DIRECT_URL を使う。
  // generate は DB 接続不要（schema から SQL を生成するだけ）。migrate 実行時のみ url を参照する。
  export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
      url: process.env.DIRECT_URL ?? "",
    },
  });
  ```
- [ ] `apps/web/vitest.config.ts` を作成（`@/` エイリアスの解決を必ず含める。tsconfig の `paths` は vitest に自動では伝わらないため、これが無いと計画B/C のテスト（`@/db/schema` 等を import）が全滅する。依存最小化のため vite-tsconfig-paths は追加せず手動 alias で解決する）:
  ```ts
  import path from "node:path";
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    // tsconfig の "@/*" → "./src/*" と同じ解決を vitest に与える
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      // pglite の WASM 初期化やマイグレーション適用に余裕を持たせる
      testTimeout: 20000,
      hookTimeout: 20000,
    },
  });
  ```
- [ ] `apps/web/.env.example` を作成（spec §11 準拠。値は空でよい。実値はコミットしない）:
  ```dotenv
  # Supabase transaction-mode pooler（port 6543）。アプリ実行時に prepare:false で接続
  DATABASE_URL=
  # Supabase 直結（port 5432）。drizzle-kit generate/migrate 用
  DIRECT_URL=
  # 共有パスワード認証（計画B で使用）
  AUTH_PASSWORD=
  AUTH_COOKIE_SECRET=
  # CloudMailin Webhook のURLトークン（計画C で使用）
  INBOUND_TOKEN=
  # 設定移行スクリプト用: ローカル Rails PostgreSQL の接続文字列
  RAILS_DATABASE_URL=
  ```
- [ ] `apps/web/package.json` の `scripts` に追記（既存 `dev`/`build`/`start`/`lint`/`codegen` は残す）:
  ```jsonc
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate"
  ```
- [ ] 型チェックが壊れていないこと（新規 config のみなので import 解決確認）: 実行 `pnpm --filter web exec tsc --noEmit`。期待: エラーなし（`src/db/schema.ts` 未作成による drizzle.config の参照は型のみで tsc 対象外。config は `.ts` だが `tsconfig.json` の include 対象外なら無視される。エラーが出た場合は Task 2 完了後に再確認する方針で可）。
- [ ] commit: `git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/drizzle.config.ts apps/web/vitest.config.ts apps/web/.env.example`（lock は root にある場合 `git add pnpm-lock.yaml`）→ `git commit -m "chore(web): add drizzle, postgres-js, pglite, vitest and configs"`

---

### Task 2: DB スキーマ定義・マイグレーション生成・接続クライアント

**Files:**
- Create: `apps/web/src/db/schema.ts`
- Create: `apps/web/src/db/client.ts`
- Create（生成物）: `apps/web/drizzle/0000_*.sql`, `apps/web/drizzle/meta/*`

**Interfaces:**
- Produces:
  - テーブル: `categories, transactions, budgets, budgetAlertSettings, budgetAlerts, paceAlertSettings, paceAlerts, storeCategoryMappings, unclassifiedAlerts, notifications, inboundEmails`
  - enum: `categoryKind`('fixed'|'variable'), `transactionSource`('email'|'manual'), `inboundEmailStatus`('pending'|'processed'|'failed'|'skipped')
  - `export const schema`（全テーブルのオブジェクト）
  - `export type Db = PgDatabase<any, Schema, ExtractTablesWithRelations<Schema>>`
  - `export type DbTransaction = PgTransaction<any, Schema, ExtractTablesWithRelations<Schema>>`
  - `export const db`（postgres-js drizzle instance, `client.ts`）
- Consumes: `DATABASE_URL`（client.ts）, `DIRECT_URL`（generate/migrate）。

**Steps:**

- [ ] `apps/web/src/db/schema.ts` を作成（spec §4.2 の全カラム・enum・index・FK・一意制約。`created_at`/`updated_at` は timestamptz。`inbound_emails` は spec 定義通り `created_at` のみ）:
  ```ts
  import {
    pgTable,
    pgEnum,
    bigserial,
    bigint,
    varchar,
    integer,
    boolean,
    timestamp,
    date,
    text,
    index,
    unique,
    type AnyPgColumn,
  } from "drizzle-orm/pg-core";
  import type { PgDatabase, PgTransaction } from "drizzle-orm/pg-core";
  import type { ExtractTablesWithRelations } from "drizzle-orm";

  export const categoryKind = pgEnum("category_kind", ["fixed", "variable"]);
  export const transactionSource = pgEnum("transaction_source", ["email", "manual"]);
  export const inboundEmailStatus = pgEnum("inbound_email_status", [
    "pending",
    "processed",
    "failed",
    "skipped",
  ]);

  export const categories = pgTable(
    "categories",
    {
      id: bigserial("id", { mode: "number" }).primaryKey(),
      name: varchar("name").notNull(),
      kind: categoryKind("kind").notNull(),
      parentId: bigint("parent_id", { mode: "number" }).references(
        (): AnyPgColumn => categories.id,
      ),
      color: varchar("color"),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index("idx_categories_parent_id").on(t.parentId)],
  );

  export const transactions = pgTable(
    "transactions",
    {
      id: bigserial("id", { mode: "number" }).primaryKey(),
      amount: integer("amount").notNull(),
      memo: varchar("memo"),
      purchasedAt: timestamp("purchased_at", { withTimezone: true, mode: "date" }).notNull(),
      storeName: varchar("store_name").notNull(),
      categoryId: bigint("category_id", { mode: "number" }).references(() => categories.id),
      source: transactionSource("source").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      index("idx_transactions_category_id").on(t.categoryId),
      index("idx_transactions_purchased_at").on(t.purchasedAt),
      index("idx_transactions_source").on(t.source),
    ],
  );

  export const budgets = pgTable(
    "budgets",
    {
      id: bigserial("id", { mode: "number" }).primaryKey(),
      categoryId: bigint("category_id", { mode: "number" })
        .notNull()
        .references(() => categories.id),
      month: date("month", { mode: "string" }).notNull(),
      amount: integer("amount").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [unique("uq_budgets_category_month").on(t.categoryId, t.month)],
  );

  export const budgetAlertSettings = pgTable("budget_alert_settings", {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    categoryId: bigint("category_id", { mode: "number" }).references(() => categories.id),
    threshold: integer("threshold").notNull(),
    threshold2: integer("threshold_2"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  });

  export const budgetAlerts = pgTable(
    "budget_alerts",
    {
      id: bigserial("id", { mode: "number" }).primaryKey(),
      categoryId: bigint("category_id", { mode: "number" })
        .notNull()
        .references(() => categories.id),
      month: date("month", { mode: "string" }).notNull(),
      threshold: integer("threshold").notNull(),
      usagePercent: integer("usage_percent").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [unique("uq_budget_alerts_cat_month_threshold").on(t.categoryId, t.month, t.threshold)],
  );

  export const paceAlertSettings = pgTable("pace_alert_settings", {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    categoryId: bigint("category_id", { mode: "number" })
      .notNull()
      .references(() => categories.id),
    threshold: integer("threshold").notNull(),
    activeFromDay: integer("active_from_day").notNull().default(5),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  });

  export const paceAlerts = pgTable(
    "pace_alerts",
    {
      id: bigserial("id", { mode: "number" }).primaryKey(),
      categoryId: bigint("category_id", { mode: "number" })
        .notNull()
        .references(() => categories.id),
      month: date("month", { mode: "string" }).notNull(),
      triggeredAt: timestamp("triggered_at", { withTimezone: true, mode: "date" }).notNull(),
      recoveredAt: timestamp("recovered_at", { withTimezone: true, mode: "date" }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index("idx_pace_alerts_category_id").on(t.categoryId)],
  );

  export const storeCategoryMappings = pgTable("store_category_mappings", {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    categoryId: bigint("category_id", { mode: "number" })
      .notNull()
      .references(() => categories.id),
    storeName: varchar("store_name").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  });

  export const unclassifiedAlerts = pgTable("unclassified_alerts", {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    count: integer("count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  });

  export const notifications = pgTable(
    "notifications",
    {
      id: bigserial("id", { mode: "number" }).primaryKey(),
      notifiableType: varchar("notifiable_type").notNull(),
      notifiableId: bigint("notifiable_id", { mode: "number" }).notNull(),
      readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      index("idx_notifications_notifiable").on(t.notifiableType, t.notifiableId),
      index("idx_notifications_read_at").on(t.readAt),
    ],
  );

  export const inboundEmails = pgTable("inbound_emails", {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    messageId: varchar("message_id").notNull().unique(),
    from: varchar("from").notNull(),
    subject: varchar("subject"),
    rawBody: text("raw_body").notNull(),
    status: inboundEmailStatus("status").notNull(),
    errorMessage: text("error_message"),
    transactionId: bigint("transaction_id", { mode: "number" }).references(() => transactions.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });

  export const schema = {
    categories,
    transactions,
    budgets,
    budgetAlertSettings,
    budgetAlerts,
    paceAlertSettings,
    paceAlerts,
    storeCategoryMappings,
    unclassifiedAlerts,
    notifications,
    inboundEmails,
  };

  export type Schema = typeof schema;

  // postgres-js / pglite いずれの driver でも受け取れるよう HKT は any にする。
  // PgDatabase は db instance と transaction の共通基底なので、Db 型引数の関数には
  // db・tx どちらも渡せる（DbTransaction は Db に代入可能）。
  export type Db = PgDatabase<any, Schema, ExtractTablesWithRelations<Schema>>;
  export type DbTransaction = PgTransaction<any, Schema, ExtractTablesWithRelations<Schema>>;
  ```
- [ ] `apps/web/src/db/client.ts` を作成:
  ```ts
  import { drizzle } from "drizzle-orm/postgres-js";
  import postgres from "postgres";
  import { schema } from "./schema";

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Supabase transaction-mode pooler は prepared statements 非対応のため prepare:false 必須。
  const queryClient = postgres(connectionString, { prepare: false });

  export const db = drizzle(queryClient, { schema });
  ```
- [ ] マイグレーション生成: 実行 `pnpm --filter web run db:generate`。期待出力: `apps/web/drizzle/0000_<name>.sql` と `apps/web/drizzle/meta/_journal.json`・`0000_snapshot.json` が生成され、`CREATE TYPE ... AS ENUM`（3つ）と 11 テーブルの `CREATE TABLE` が含まれる。DB 接続は不要。
- [ ] 生成 SQL の目視確認: `apps/web/drizzle/0000_*.sql` を開き、(a) `category_kind`/`transaction_source`/`inbound_email_status` の enum が作られている (b) `budgets` に `uq_budgets_category_month` (c) `budget_alerts` に `(category_id, month, threshold)` unique (d) `store_category_mappings.store_name` と `inbound_emails.message_id` が unique、を確認。
- [ ] 型チェック: 実行 `pnpm --filter web exec tsc --noEmit`。期待: エラーなし。
- [ ] commit: `git add apps/web/src/db apps/web/drizzle` → `git commit -m "feat(web): add drizzle schema, client and initial migration"`

---

### Task 3: JST 日付ユーティリティ `dates.ts`（TDD）

**Files:**
- Test: `apps/web/src/lib/dates.test.ts`
- Create: `apps/web/src/lib/dates.ts`

**Interfaces:**
- Produces:
  - `jstDateParts(date: Date): { year: number; month: number; day: number }`
  - `jstToday(): Date`
  - `jstDayOfMonth(date: Date): number`
  - `jstDaysInMonth(year: number, month: number): number`
  - `jstMonthRange(year: number, month: number): { start: Date; end: Date }`
  - `jstEndOfDay(date: Date): Date`
  - `monthKey(year: number, month: number): string`（`'YYYY-MM-01'`）
  - `jstMonthKey(date: Date): string`（date の JST 月初 `'YYYY-MM-01'`）
- Consumes: なし（純粋）。

**Steps:**

- [ ] `apps/web/src/lib/dates.test.ts` を作成（失敗するテスト）:
  ```ts
  import { describe, it, expect } from "vitest";
  import {
    jstDateParts,
    jstDayOfMonth,
    jstDaysInMonth,
    jstMonthRange,
    jstEndOfDay,
    monthKey,
    jstMonthKey,
  } from "./dates";

  describe("jstDateParts", () => {
    it("UTC 15:30 は JST では翌日", () => {
      expect(jstDateParts(new Date("2026-07-08T15:30:00Z"))).toEqual({
        year: 2026,
        month: 7,
        day: 9,
      });
    });
    it("UTC 14:59 は JST では同日 23:59", () => {
      expect(jstDateParts(new Date("2026-07-08T14:59:00Z"))).toEqual({
        year: 2026,
        month: 7,
        day: 8,
      });
    });
  });

  describe("jstDayOfMonth", () => {
    it("JST の日番号を返す", () => {
      expect(jstDayOfMonth(new Date("2026-07-08T15:30:00Z"))).toBe(9);
    });
  });

  describe("jstDaysInMonth", () => {
    it("うるう年2月は29", () => {
      expect(jstDaysInMonth(2024, 2)).toBe(29);
    });
    it("平年2月は28", () => {
      expect(jstDaysInMonth(2026, 2)).toBe(28);
    });
    it("7月は31、4月は30", () => {
      expect(jstDaysInMonth(2026, 7)).toBe(31);
      expect(jstDaysInMonth(2026, 4)).toBe(30);
    });
  });

  describe("jstMonthRange", () => {
    it("JST 月初は前日 UTC15:00、月末は末日 UTC14:59:59.999", () => {
      const { start, end } = jstMonthRange(2026, 7);
      expect(start.toISOString()).toBe("2026-06-30T15:00:00.000Z");
      expect(end.toISOString()).toBe("2026-07-31T14:59:59.999Z");
    });
  });

  describe("jstEndOfDay", () => {
    it("JST の当日終端（UTC では翌日14:59:59.999）を返す", () => {
      expect(jstEndOfDay(new Date("2026-07-08T05:00:00Z")).toISOString()).toBe(
        "2026-07-08T14:59:59.999Z",
      );
    });
  });

  describe("monthKey / jstMonthKey", () => {
    it("monthKey はゼロ埋め YYYY-MM-01", () => {
      expect(monthKey(2026, 7)).toBe("2026-07-01");
      expect(monthKey(2026, 12)).toBe("2026-12-01");
    });
    it("jstMonthKey は date の JST 月初", () => {
      expect(jstMonthKey(new Date("2026-07-31T15:30:00Z"))).toBe("2026-08-01");
    });
  });
  ```
- [ ] 失敗確認: 実行 `pnpm --filter web exec vitest run src/lib/dates.test.ts`。期待: `dates.ts` 未作成で import 解決に失敗（モジュール解決エラー）。
- [ ] `apps/web/src/lib/dates.ts` を実装（JST=UTC+9 固定の手計算）:
  ```ts
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

  /** 絶対時刻を JST カレンダーの年・月(1-12)・日に分解する。 */
  export function jstDateParts(date: Date): { year: number; month: number; day: number } {
    const t = new Date(date.getTime() + JST_OFFSET_MS);
    return {
      year: t.getUTCFullYear(),
      month: t.getUTCMonth() + 1,
      day: t.getUTCDate(),
    };
  }

  /** JST における「今日」を表す現在時刻。日付演算は jstDateParts 等を通す。 */
  export function jstToday(): Date {
    return new Date();
  }

  /** JST での日番号（Ruby の Date#day 相当）。 */
  export function jstDayOfMonth(date: Date): number {
    return jstDateParts(date).day;
  }

  /** JST 指定月の末日の日番号（Ruby の end_of_month.day 相当）。 */
  export function jstDaysInMonth(year: number, month: number): number {
    // Date.UTC の day=0 は前月末日 → month をそのまま渡すと当月末日になる
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /** JST 指定月の月初〜月末（Ruby の all_month 相当）の絶対時刻範囲。 */
  export function jstMonthRange(year: number, month: number): { start: Date; end: Date } {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - JST_OFFSET_MS);
    const last = jstDaysInMonth(year, month);
    const end = new Date(Date.UTC(year, month - 1, last, 23, 59, 59, 999) - JST_OFFSET_MS);
    return { start, end };
  }

  /** date が属する JST 日の終端（23:59:59.999）の絶対時刻（Ruby の end_of_day 相当）。 */
  export function jstEndOfDay(date: Date): Date {
    const { year, month, day } = jstDateParts(date);
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - JST_OFFSET_MS);
  }

  const pad2 = (n: number): string => String(n).padStart(2, "0");

  /** 'YYYY-MM-01'（budgets.month 等の date カラム比較キー）。 */
  export function monthKey(year: number, month: number): string {
    return `${year}-${pad2(month)}-01`;
  }

  /** date が属する JST 月の月初キー 'YYYY-MM-01'（Ruby の beginning_of_month 相当）。 */
  export function jstMonthKey(date: Date): string {
    const { year, month } = jstDateParts(date);
    return monthKey(year, month);
  }
  ```
- [ ] パス確認: 実行 `pnpm --filter web exec vitest run src/lib/dates.test.ts`。期待: 全テスト green。
- [ ] commit: `git add apps/web/src/lib/dates.ts apps/web/src/lib/dates.test.ts` → `git commit -m "feat(web): add JST date utilities"`

---

### Task 4: pglite テスト基盤 `src/test/db.ts` + スキーマ・スモークテスト

**Files:**
- Create: `apps/web/src/test/db.ts`
- Test: `apps/web/src/test/schema-smoke.test.ts`

**Interfaces:**
- Produces: `createTestDb(): Promise<{ db: TestDatabase; client: PGlite; teardown: () => Promise<void> }>`（`db` は Drizzle instance。`Db`/`DbTransaction` 型引数の関数へ渡せる。`teardown` は `client.close()` のラッパーで、呼び出し側はこれ1つで後始末できる。計画B/C はこのシェイプを前提に consume する）。テスト毎に新規インメモリ PG を作りマイグレーションを適用する。
- Consumes: `apps/web/drizzle`（Task 2 生成の migrations）, `src/db/schema.ts`。

**Steps:**

- [ ] `apps/web/src/test/db.ts` を作成:
  ```ts
  import { PGlite } from "@electric-sql/pglite";
  import { drizzle } from "drizzle-orm/pglite";
  import { migrate } from "drizzle-orm/pglite/migrator";
  import { fileURLToPath } from "node:url";
  import { schema } from "../db/schema";

  const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

  export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

  /** テスト毎に新規インメモリ PostgreSQL を構築し、生成済みマイグレーションを適用する。 */
  export async function createTestDb(): Promise<{
    db: TestDatabase;
    client: PGlite;
    teardown: () => Promise<void>;
  }> {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    const teardown = () => client.close();
    return { db, client, teardown };
  }
  ```
- [ ] `apps/web/src/test/schema-smoke.test.ts` を作成（失敗するテスト。スキーマ／マイグレーションの健全性検証）:
  ```ts
  import { describe, it, expect, afterEach } from "vitest";
  import { eq } from "drizzle-orm";
  import { createTestDb, type TestDatabase } from "./db";
  import { categories, transactions } from "../db/schema";

  let db: TestDatabase;
  let teardown: () => Promise<void>;

  afterEach(async () => {
    await teardown?.();
  });

  describe("schema smoke", () => {
    it("マイグレーション適用後にカテゴリと取引を insert できる", async () => {
      ({ db, teardown } = await createTestDb());

      const [cat] = await db
        .insert(categories)
        .values({ name: "食費", kind: "variable" })
        .returning();
      expect(cat.id).toBeGreaterThan(0);

      const [tx] = await db
        .insert(transactions)
        .values({
          amount: 1000,
          storeName: "テスト店",
          purchasedAt: new Date("2026-07-08T07:22:00Z"),
          categoryId: cat.id,
          source: "email",
        })
        .returning();
      expect(tx.amount).toBe(1000);

      const found = await db.select().from(categories).where(eq(categories.id, cat.id));
      expect(found).toHaveLength(1);
    });
  });
  ```
- [ ] 失敗確認: 実行 `pnpm --filter web exec vitest run src/test/schema-smoke.test.ts`。期待: `src/test/db.ts` 未作成なら import 解決失敗、作成済みなら初回 red の可能性は低いが、まず migrations 不整合があればここで検出する。
- [ ] パス確認: 実行 `pnpm --filter web exec vitest run src/test/schema-smoke.test.ts`。期待: green（pglite にマイグレーションが適用され insert/select 成功）。
- [ ] commit: `git add apps/web/src/test` → `git commit -m "test(web): add pglite test harness and schema smoke test"`

---

### Task 5: 予算ペース計算 `budget-pace.ts`（TDD・純粋関数）

**Files:**
- Test: `apps/web/src/lib/budget-pace.test.ts`
- Create: `apps/web/src/lib/budget-pace.ts`

**Interfaces:**
- Produces:
  - `type PaceStatus = "GREEN" | "YELLOW" | "RED"`
  - `type BudgetPace = { paceRate: number; paceStatus: PaceStatus; remainingAmount: number; dailyAmount: number; idealRate: number; actualRate: number }`
  - `calcBudgetPace(input: { budgetAmount: number; spentAmount: number; date: Date }): BudgetPace`
- Consumes: `dates.ts`（`jstDateParts`, `jstDaysInMonth`）。予算の有無判定は呼び出し側の責務（本関数は budgetAmount を受け取り常に計算する）。

**Steps:**

- [ ] `apps/web/src/lib/budget-pace.test.ts` を作成（RSpec `budget_pace_calculator_spec.rb` の境界値を移植。2025-01-10=31日月, budget 30000, idealRate=10/31）:
  ```ts
  import { describe, it, expect } from "vitest";
  import { calcBudgetPace } from "./budget-pace";

  // JST 2025-01-10 固定
  const d = (iso: string) => new Date(iso);
  const JAN10 = d("2025-01-10T00:00:00+09:00");
  const JAN31 = d("2025-01-31T00:00:00+09:00");

  describe("calcBudgetPace", () => {
    it("GREEN: ペース以内", () => {
      const r = calcBudgetPace({ budgetAmount: 30_000, spentAmount: 8_000, date: JAN10 });
      expect(r.paceStatus).toBe("GREEN"); // pace_rate ≈ 0.83
      expect(r.remainingAmount).toBe(22_000);
      expect(r.dailyAmount).toBe(1_000); // floor(22000 / 22)
    });

    it("YELLOW: ややペース超過", () => {
      const r = calcBudgetPace({ budgetAmount: 30_000, spentAmount: 10_000, date: JAN10 });
      expect(r.paceStatus).toBe("YELLOW"); // pace_rate ≈ 1.03
    });

    it("RED: 大幅ペース超過", () => {
      const r = calcBudgetPace({ budgetAmount: 30_000, spentAmount: 15_000, date: JAN10 });
      expect(r.paceStatus).toBe("RED"); // pace_rate ≈ 1.55
    });

    it("YELLOW 境界: pace_rate = 1.0 ちょうど", () => {
      // budget 31000, spent 10000, ideal=10/31 → actual=10000/31000=ideal → pace_rate=1.0
      const r = calcBudgetPace({ budgetAmount: 31_000, spentAmount: 10_000, date: JAN10 });
      expect(r.paceRate).toBeCloseTo(1.0, 10);
      expect(r.paceStatus).toBe("YELLOW");
    });

    it("RED 境界: pace_rate = 1.2 ちょうど", () => {
      // budget 31000, spent 12000 → actual=12000/31000, pace_rate = actual/(10/31) = 1.2
      const r = calcBudgetPace({ budgetAmount: 31_000, spentAmount: 12_000, date: JAN10 });
      expect(r.paceRate).toBeCloseTo(1.2, 10);
      expect(r.paceStatus).toBe("RED");
    });

    it("actual_rate >= 1.0 は pace_rate に関わらず強制 RED", () => {
      // 1/31 に予算使い切り: ideal=1.0, pace_rate=1.0（本来 YELLOW）だが actual>=1 で RED
      const r = calcBudgetPace({ budgetAmount: 30_000, spentAmount: 30_000, date: JAN31 });
      expect(r.paceStatus).toBe("RED");
      expect(r.dailyAmount).toBe(0); // remaining_days=1, remaining=0
    });

    it("daily_amount は負値でも floor（trunc ではない）", () => {
      // remaining=-10000, remaining_days=22 → floor(-454.5)=-455
      const r = calcBudgetPace({ budgetAmount: 30_000, spentAmount: 40_000, date: JAN10 });
      expect(r.dailyAmount).toBe(-455);
    });
  });
  ```
- [ ] 失敗確認: 実行 `pnpm --filter web exec vitest run src/lib/budget-pace.test.ts`。期待: import 解決失敗（未実装）。
- [ ] `apps/web/src/lib/budget-pace.ts` を実装（spec §5.1・§5.7。数式は `budget_pace_calculator.rb` と同一）:
  ```ts
  import { jstDateParts, jstDaysInMonth } from "./dates";

  export type PaceStatus = "GREEN" | "YELLOW" | "RED";

  export type BudgetPace = {
    paceRate: number;
    paceStatus: PaceStatus;
    remainingAmount: number;
    dailyAmount: number;
    idealRate: number;
    actualRate: number;
  };

  const GREEN_THRESHOLD = 1.0;
  const YELLOW_THRESHOLD = 1.2;

  /**
   * 予算消化ペースを計算する（純粋関数）。
   * budget の存在確認・spent の集計は呼び出し側の責務。
   */
  export function calcBudgetPace(input: {
    budgetAmount: number;
    spentAmount: number;
    date: Date;
  }): BudgetPace {
    const { budgetAmount, spentAmount, date } = input;
    const { year, month, day } = jstDateParts(date);

    const daysInMonth = jstDaysInMonth(year, month);
    const daysElapsed = day;
    const remainingDays = daysInMonth - daysElapsed + 1; // 当日を含む残り日数

    const idealRate = daysElapsed / daysInMonth;
    const actualRate = spentAmount / budgetAmount;
    const paceRate = idealRate === 0 ? 0 : actualRate / idealRate;

    let paceStatus: PaceStatus;
    if (actualRate >= 1.0) {
      paceStatus = "RED"; // 予算そのものを使い切っている
    } else if (paceRate >= YELLOW_THRESHOLD) {
      paceStatus = "RED";
    } else if (paceRate >= GREEN_THRESHOLD) {
      paceStatus = "YELLOW";
    } else {
      paceStatus = "GREEN";
    }

    const remainingAmount = budgetAmount - spentAmount;
    // Ruby の整数除算は floor（負値も -infinity 方向）。Math.trunc は使わない。
    const dailyAmount = remainingDays <= 0 ? 0 : Math.floor(remainingAmount / remainingDays);

    return { paceRate, paceStatus, remainingAmount, dailyAmount, idealRate, actualRate };
  }
  ```
- [ ] パス確認: 実行 `pnpm --filter web exec vitest run src/lib/budget-pace.test.ts`。期待: 全 green。
- [ ] commit: `git add apps/web/src/lib/budget-pace.ts apps/web/src/lib/budget-pace.test.ts` → `git commit -m "feat(web): add budget pace calculation"`

---

### Task 6: クレカ利用メールパーサー `email-parser.ts`（TDD・fixture 使用）

**Files:**
- Test: `apps/web/src/lib/email-parser.test.ts`
- Create: `apps/web/src/lib/email-parser.ts`

**Interfaces:**
- Produces:
  - `type ParseResult = { ok: true; amount: number; storeName: string; purchasedAt: Date } | { ok: false; reason: "not_target" | "parse_error"; error?: string }`
  - `parseSmbcEmail(input: { from: string; subject: string; plain: string }): ParseResult`
- Consumes: なし（純粋。`plain` はデコード済み UTF-8 前提）。

**Steps:**

- [ ] `apps/web/src/lib/email-parser.test.ts` を作成（失敗するテスト。fixture の text/plain を再構築して入力にする。ESC 再挿入・U+FFFD 除去は fixture 破損への対処で、テストヘルパ内に閉じる）:
  ```ts
  import { describe, it, expect } from "vitest";
  import { readFileSync } from "node:fs";
  import { fileURLToPath } from "node:url";
  import { parseSmbcEmail } from "./email-parser";

  const FIXTURE_DIR = "../../../../docs/superpowers/specs/fixtures/";

  // fixture(.eml) の text/plain パートを CloudMailin の `plain`（UTF-8）相当へ再構築する。
  // fixture は ESC(0x1B) が欠落しているため $B/(B 等の直前に ESC を補い、
  // デコード後に残る U+FFFD（ロスした shift 由来のゴミ）を除去する。
  function loadPlain(fileName: string): string {
    const path = fileURLToPath(new URL(FIXTURE_DIR + fileName, import.meta.url));
    const s = readFileSync(path).toString("latin1");
    const p = s.indexOf("Content-Type: text/plain");
    const headerEnd = s.indexOf("\n\n", p);
    const bodyStart = headerEnd + 2;
    const nextBoundary = s.indexOf("\n--", bodyStart);
    const body = s.slice(bodyStart, nextBoundary < 0 ? undefined : nextBoundary);
    const withEsc = body.replace(/\$B|\$@|\(B|\(J|\(I/g, (m) => "\x1b" + m);
    const decoded = new TextDecoder("iso-2022-jp").decode(Buffer.from(withEsc, "latin1"));
    return decoded.replace(/�/g, "");
  }

  // CloudMailin は headers.from / headers.subject をデコード済みで届ける。
  const FROM = "三井住友カード <statement@vpass.ne.jp>";
  const SUBJECT = "ご利用のお知らせ【三井住友カード】";

  describe("parseSmbcEmail", () => {
    it("全角店名・時刻付き（sample1）を抽出する", () => {
      const plain = loadPlain("smbc-usage-notification-sample.eml");
      const r = parseSmbcEmail({ from: FROM, subject: SUBJECT, plain });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount).toBe(433);
      expect(r.storeName).toBe("セブン-イレブン"); // NFKC 後は ASCII ハイフン
      expect(r.purchasedAt.toISOString()).toBe("2026-07-08T07:22:00.000Z"); // 16:22 JST
    });

    it("ASCII店名・カンマ区切り金額（sample2）を抽出する", () => {
      const plain = loadPlain("smbc-usage-notification-sample2.eml");
      const r = parseSmbcEmail({ from: FROM, subject: SUBJECT, plain });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount).toBe(1076);
      expect(r.storeName).toBe("BELC WAKOSHIRAKO");
      expect(r.purchasedAt.toISOString()).toBe("2026-07-08T14:24:00.000Z"); // 23:24 JST
    });

    it("対象外の送信元は not_target", () => {
      const r = parseSmbcEmail({
        from: "noreply@example.com",
        subject: SUBJECT,
        plain: "利用金額：100 円",
      });
      expect(r).toEqual({ ok: false, reason: "not_target" });
    });

    it("対象外の件名は not_target", () => {
      const r = parseSmbcEmail({
        from: FROM,
        subject: "転送確認メール",
        plain: "利用金額：100 円",
      });
      expect(r).toEqual({ ok: false, reason: "not_target" });
    });

    it("必須項目が欠けると parse_error", () => {
      const r = parseSmbcEmail({
        from: FROM,
        subject: SUBJECT,
        plain: "利用先：どこか\n利用金額：100 円", // 利用日 欠落
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("parse_error");
      expect(r.error).toContain("利用日");
    });
  });
  ```
- [ ] 失敗確認: 実行 `pnpm --filter web exec vitest run src/lib/email-parser.test.ts`。期待: import 解決失敗（未実装）。
- [ ] `apps/web/src/lib/email-parser.ts` を実装（spec §6.1。ラベルは実 fixture に合わせ `(?:ご)?` を付与。日時は JST として解釈）:
  ```ts
  export type ParseResult =
    | { ok: true; amount: number; storeName: string; purchasedAt: Date }
    | { ok: false; reason: "not_target" | "parse_error"; error?: string };

  const TARGET_FROM = "statement@vpass.ne.jp";
  const TARGET_SUBJECT = "ご利用のお知らせ";
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

  // 実 fixture の text/plain はラベルに「ご」が付かない（◇利用日 等）ため (?:ご)? で両対応。
  const DATE_RE = /(?:ご)?利用日(?:時)?[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/;
  const STORE_RE = /(?:ご)?利用先[：:]\s*(.+)/;
  const AMOUNT_RE = /(?:ご)?利用金額[：:]\s*([\d,]+)\s*円/;

  /** 三井住友カード(Vpass)のクレカ利用通知メールをパースする。 */
  export function parseSmbcEmail(input: {
    from: string;
    subject: string;
    plain: string;
  }): ParseResult {
    const { from, subject, plain } = input;

    if (!from.includes(TARGET_FROM) || !subject.includes(TARGET_SUBJECT)) {
      return { ok: false, reason: "not_target" };
    }

    const dateMatch = plain.match(DATE_RE);
    const storeMatch = plain.match(STORE_RE);
    const amountMatch = plain.match(AMOUNT_RE);

    const missing: string[] = [];
    if (!dateMatch) missing.push("利用日");
    if (!storeMatch) missing.push("利用先");
    if (!amountMatch) missing.push("利用金額");
    if (missing.length > 0) {
      return { ok: false, reason: "parse_error", error: `抽出失敗: ${missing.join(", ")}` };
    }

    const [, ymd, hm] = dateMatch!;
    const [y, mo, d] = ymd.split("/").map(Number);
    let hh = 0;
    let mm = 0;
    if (hm) {
      const [h, m] = hm.split(":").map(Number);
      hh = h;
      mm = m;
    }
    // マッチした年月日・時刻は JST として解釈し、絶対時刻(UTC)へ変換する。
    const purchasedAt = new Date(Date.UTC(y, mo - 1, d, hh, mm, 0) - JST_OFFSET_MS);

    // 全角ハイフン・全角英数の表記揺れを吸収するため NFKC 正規化する。
    const storeName = storeMatch![1].trim().normalize("NFKC");
    const amount = Number.parseInt(amountMatch![1].replace(/,/g, ""), 10);

    return { ok: true, amount, storeName, purchasedAt };
  }
  ```
- [ ] パス確認: 実行 `pnpm --filter web exec vitest run src/lib/email-parser.test.ts`。期待: 全 green。
- [ ] commit: `git add apps/web/src/lib/email-parser.ts apps/web/src/lib/email-parser.test.ts` → `git commit -m "feat(web): add SMBC credit-card email parser"`

---

### Task 7: 月次サマリー `monthly-summary.ts`（TDD・pglite integration）

**Files:**
- Test: `apps/web/src/lib/monthly-summary.test.ts`
- Create: `apps/web/src/lib/monthly-summary.ts`

**Interfaces:**
- Produces:
  - `type CategoryBreakdown = { categoryId: number; categoryName: string; amount: number; percentage: number; paceStatus: PaceStatus | null; budgetAmount: number | null; remainingAmount: number | null; dailyAmount: number | null }`
  - `type MonthlySummary = { totalAmount: number; budgetAmount: number; remainingAmount: number; categoryBreakdowns: CategoryBreakdown[] }`
  - `getMonthlySummary(db: Db, year: number, month: number): Promise<MonthlySummary>`
- Consumes: `Db`（schema.ts）, `budget-pace.ts`（`calcBudgetPace`, `PaceStatus`）, `dates.ts`（`jstMonthRange`, `monthKey`, `jstToday`, `jstDateParts`, `jstEndOfDay`）, テーブル `transactions`/`budgets`/`categories`。

**Steps:**

- [ ] `apps/web/src/lib/monthly-summary.test.ts` を作成（RSpec `monthly_summary_service_spec.rb` を移植。過去月＝ペース null）:
  ```ts
  import { describe, it, expect, afterEach } from "vitest";
  import { createTestDb, type TestDatabase } from "../test/db";
  import { categories, budgets, transactions } from "../db/schema";
  import { getMonthlySummary } from "./monthly-summary";

  let db: TestDatabase;
  let teardown: () => Promise<void>;

  afterEach(async () => {
    await teardown?.();
  });

  const jst = (iso: string) => new Date(iso);

  describe("getMonthlySummary", () => {
    it("2024年1月の合計・予算・残額・内訳を返す", async () => {
      ({ db, teardown } = await createTestDb());

      const [food] = await db
        .insert(categories)
        .values({ name: "食費", kind: "variable" })
        .returning();
      const [daily] = await db
        .insert(categories)
        .values({ name: "日用品", kind: "variable" })
        .returning();

      await db.insert(transactions).values([
        { amount: 3000, storeName: "a", purchasedAt: jst("2024-01-02T10:00:00+09:00"), categoryId: food.id, source: "manual" },
        { amount: 2000, storeName: "b", purchasedAt: jst("2024-01-03T10:00:00+09:00"), categoryId: food.id, source: "manual" },
        { amount: 1000, storeName: "c", purchasedAt: jst("2024-01-04T10:00:00+09:00"), categoryId: daily.id, source: "manual" },
        // 対象月外（集計に含めない）
        { amount: 9999, storeName: "d", purchasedAt: jst("2023-12-31T10:00:00+09:00"), categoryId: food.id, source: "manual" },
      ]);

      await db.insert(budgets).values([
        { categoryId: food.id, month: "2024-01-01", amount: 30_000 },
        { categoryId: daily.id, month: "2024-01-01", amount: 10_000 },
      ]);

      const r = await getMonthlySummary(db, 2024, 1);
      expect(r.totalAmount).toBe(6000);
      expect(r.budgetAmount).toBe(40_000);
      expect(r.remainingAmount).toBe(34_000);
      expect(r.categoryBreakdowns).toHaveLength(2);

      const foodB = r.categoryBreakdowns.find((b) => b.categoryName === "食費")!;
      expect(foodB.amount).toBe(5000);
      expect(foodB.percentage).toBeCloseTo(83.3, 1);

      const dailyB = r.categoryBreakdowns.find((b) => b.categoryName === "日用品")!;
      expect(dailyB.amount).toBe(1000);
      expect(dailyB.percentage).toBeCloseTo(16.7, 1);

      // 過去月なのでペースは null
      expect(foodB.paceStatus).toBeNull();
      expect(foodB.budgetAmount).toBeNull();
    });

    it("取引ゼロなら合計0・内訳空", async () => {
      ({ db, teardown } = await createTestDb());
      const r = await getMonthlySummary(db, 2024, 1);
      expect(r.totalAmount).toBe(0);
      expect(r.budgetAmount).toBe(0);
      expect(r.remainingAmount).toBe(0);
      expect(r.categoryBreakdowns).toEqual([]);
    });
  });
  ```
- [ ] 失敗確認: 実行 `pnpm --filter web exec vitest run src/lib/monthly-summary.test.ts`。期待: import 解決失敗（未実装）。
- [ ] `apps/web/src/lib/monthly-summary.ts` を実装（spec §5.2。数式は `monthly_summary_service.rb` と同一。percentage は非負のため `Math.round(x*10)/10`）:
  ```ts
  import { and, eq, gte, lte, sql } from "drizzle-orm";
  import type { Db } from "../db/schema";
  import { budgets, categories, transactions } from "../db/schema";
  import { calcBudgetPace, type PaceStatus } from "./budget-pace";
  import { jstDateParts, jstEndOfDay, jstMonthRange, jstToday, monthKey } from "./dates";

  export type CategoryBreakdown = {
    categoryId: number;
    categoryName: string;
    amount: number;
    percentage: number;
    paceStatus: PaceStatus | null;
    budgetAmount: number | null;
    remainingAmount: number | null;
    dailyAmount: number | null;
  };

  export type MonthlySummary = {
    totalAmount: number;
    budgetAmount: number;
    remainingAmount: number;
    categoryBreakdowns: CategoryBreakdown[];
  };

  export async function getMonthlySummary(
    db: Db,
    year: number,
    month: number,
  ): Promise<MonthlySummary> {
    const { start, end } = jstMonthRange(year, month);
    const mKey = monthKey(year, month);

    const totalRow = await db
      .select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
      .from(transactions)
      .where(and(gte(transactions.purchasedAt, start), lte(transactions.purchasedAt, end)));
    const totalAmount = Number(totalRow[0].total);

    const budgetRow = await db
      .select({ total: sql<string>`coalesce(sum(${budgets.amount}), 0)` })
      .from(budgets)
      .where(eq(budgets.month, mKey));
    const budgetAmount = Number(budgetRow[0].total);

    // カテゴリ別集計（category_id が null の取引は inner join で除外される）
    const grouped = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        amount: sql<string>`sum(${transactions.amount})`,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.purchasedAt, start), lte(transactions.purchasedAt, end)))
      .groupBy(transactions.categoryId, categories.name);

    // 過去月はペース計算が無意味なため pace_date = null（当月のみ当日を使う）
    const now = jstToday();
    const nowParts = jstDateParts(now);
    const paceDate = nowParts.year === year && nowParts.month === month ? now : null;

    const categoryBreakdowns: CategoryBreakdown[] = [];
    for (const row of grouped) {
      const categoryId = row.categoryId as number;
      const amount = Number(row.amount);
      const percentage = totalAmount === 0 ? 0 : Math.round((amount / totalAmount) * 100 * 10) / 10;

      let paceStatus: PaceStatus | null = null;
      let bAmount: number | null = null;
      let rAmount: number | null = null;
      let dAmount: number | null = null;

      if (paceDate) {
        const budget = (
          await db
            .select()
            .from(budgets)
            .where(and(eq(budgets.categoryId, categoryId), eq(budgets.month, mKey)))
            .limit(1)
        )[0];
        if (budget) {
          const spentRow = await db
            .select({ spent: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
            .from(transactions)
            .where(
              and(
                eq(transactions.categoryId, categoryId),
                gte(transactions.purchasedAt, start),
                lte(transactions.purchasedAt, jstEndOfDay(paceDate)),
              ),
            );
          const spent = Number(spentRow[0].spent);
          const pace = calcBudgetPace({
            budgetAmount: budget.amount,
            spentAmount: spent,
            date: paceDate,
          });
          paceStatus = pace.paceStatus;
          bAmount = budget.amount;
          rAmount = pace.remainingAmount;
          dAmount = pace.dailyAmount;
        }
      }

      categoryBreakdowns.push({
        categoryId,
        categoryName: row.categoryName,
        amount,
        percentage,
        paceStatus,
        budgetAmount: bAmount,
        remainingAmount: rAmount,
        dailyAmount: dAmount,
      });
    }

    return {
      totalAmount,
      budgetAmount,
      remainingAmount: budgetAmount - totalAmount,
      categoryBreakdowns,
    };
  }
  ```
- [ ] パス確認: 実行 `pnpm --filter web exec vitest run src/lib/monthly-summary.test.ts`。期待: 全 green。
- [ ] commit: `git add apps/web/src/lib/monthly-summary.ts apps/web/src/lib/monthly-summary.test.ts` → `git commit -m "feat(web): add monthly summary aggregation"`

---

### Task 8: アラート判定 `alerts.ts`（TDD・pglite integration）

**Files:**
- Test: `apps/web/src/lib/alerts.test.ts`
- Create: `apps/web/src/lib/alerts.ts`

**Interfaces:**
- Produces:
  - `evaluateAlertsForTransaction(tx: DbTransaction, transactionId: number): Promise<void>`（予算アラート判定 §5.3 + ペースアラート判定 §5.4 を同一 tx 内で実行）
  - `refreshUnclassifiedAlert(tx: DbTransaction): Promise<void>`（未分類アラート判定 §5.6）
- Consumes: `DbTransaction`（schema.ts）, `budget-pace.ts`（`calcBudgetPace`）, `dates.ts`（`jstDateParts`, `jstMonthRange`, `jstEndOfDay`, `jstToday`, `monthKey`）, 全アラート系テーブル + `notifications`。
- 呼び出し規約（計画C 向け）: 取引の insert/update/delete と**同一 DB トランザクション内**で `evaluateAlertsForTransaction` を呼び、未分類件数に影響する経路では続けて `refreshUnclassifiedAlert(tx)` も呼ぶ。両関数はサブスクリプション trigger やメール送信を行わない（それらは廃止済み）。

**Steps:**

- [ ] `apps/web/src/lib/alerts.test.ts` を作成（RSpec `budget_alert_job_spec.rb` / `pace_alert_job_spec.rb` / `unclassified_alert_job_spec.rb` を移植。`vi.setSystemTime` で日付を固定）:
  ```ts
  import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
  import { and, eq, isNull } from "drizzle-orm";
  import { createTestDb, type TestDatabase } from "../test/db";
  import {
    categories,
    budgets,
    transactions,
    budgetAlertSettings,
    budgetAlerts,
    paceAlertSettings,
    paceAlerts,
    unclassifiedAlerts,
    notifications,
  } from "../db/schema";
  import { evaluateAlertsForTransaction, refreshUnclassifiedAlert } from "./alerts";

  let db: TestDatabase;
  let teardown: () => Promise<void>;

  afterEach(async () => {
    vi.useRealTimers();
    await teardown?.();
  });

  // 固定「今日」: 2026-07-10（JST）
  const setToday = () => vi.setSystemTime(new Date("2026-07-10T03:00:00+09:00"));
  const MONTH_KEY = "2026-07-01";

  async function makeCategory(name = "食費") {
    const [c] = await db.insert(categories).values({ name, kind: "variable" }).returning();
    return c;
  }
  async function insertTx(categoryId: number | null, amount: number) {
    const [t] = await db
      .insert(transactions)
      .values({
        amount,
        storeName: "s",
        purchasedAt: new Date("2026-07-10T03:00:00+09:00"),
        categoryId,
        source: "manual",
      })
      .returning();
    return t;
  }
  const evaluate = (id: number) => db.transaction((tx) => evaluateAlertsForTransaction(tx, id));

  describe("evaluateAlertsForTransaction: 予算アラート", () => {
    beforeEach(async () => {
      setToday();
      ({ db, teardown } = await createTestDb());
    });

    it("使用率が閾値超過で BudgetAlert と Notification を1件ずつ作成", async () => {
      const c = await makeCategory();
      await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 10_000 });
      await db
        .insert(budgetAlertSettings)
        .values({ categoryId: c.id, threshold: 80, threshold2: null, isActive: true });
      const t = await insertTx(c.id, 8_500); // 85% >= 80

      await evaluate(t.id);

      const alerts = await db.select().from(budgetAlerts);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].threshold).toBe(80);
      expect(alerts[0].month).toBe(MONTH_KEY);
      const notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.notifiableType, "BudgetAlert"));
      expect(notifs).toHaveLength(1);
      expect(notifs[0].notifiableId).toBe(alerts[0].id);
    });

    it("使用率が閾値未満なら作成しない", async () => {
      const c = await makeCategory();
      await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 10_000 });
      await db.insert(budgetAlertSettings).values({ categoryId: c.id, threshold: 80 });
      const t = await insertTx(c.id, 7_000); // 70% < 80
      await evaluate(t.id);
      expect(await db.select().from(budgetAlerts)).toHaveLength(0);
    });

    it("予算未設定なら作成しない", async () => {
      const c = await makeCategory();
      await db.insert(budgetAlertSettings).values({ categoryId: c.id, threshold: 80 });
      const t = await insertTx(c.id, 9_000);
      await evaluate(t.id);
      expect(await db.select().from(budgetAlerts)).toHaveLength(0);
    });

    it("設定が無効なら作成しない", async () => {
      const c = await makeCategory();
      await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 10_000 });
      await db.insert(budgetAlertSettings).values({ categoryId: c.id, threshold: 80, isActive: false });
      const t = await insertTx(c.id, 8_500);
      await evaluate(t.id);
      expect(await db.select().from(budgetAlerts)).toHaveLength(0);
    });

    it("同一閾値で既存アラートがあれば重複作成しない", async () => {
      const c = await makeCategory();
      await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 10_000 });
      await db.insert(budgetAlertSettings).values({ categoryId: c.id, threshold: 80 });
      await db
        .insert(budgetAlerts)
        .values({ categoryId: c.id, month: MONTH_KEY, threshold: 80, usagePercent: 85 });
      const t = await insertTx(c.id, 8_500);
      await evaluate(t.id);
      expect(await db.select().from(budgetAlerts)).toHaveLength(1);
    });

    it("threshold_2 も超過すれば2件作成する", async () => {
      const c = await makeCategory();
      await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 10_000 });
      await db
        .insert(budgetAlertSettings)
        .values({ categoryId: c.id, threshold: 80, threshold2: 100 });
      const t = await insertTx(c.id, 10_500); // 105% >= 80 and >= 100
      await evaluate(t.id);
      expect(await db.select().from(budgetAlerts)).toHaveLength(2);
      const notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.notifiableType, "BudgetAlert"));
      expect(notifs).toHaveLength(2);
    });

    it("未分類取引ではアラート判定しない", async () => {
      const t = await insertTx(null, 9_999);
      await evaluate(t.id);
      expect(await db.select().from(budgetAlerts)).toHaveLength(0);
    });
  });

  describe("evaluateAlertsForTransaction: ペースアラート", () => {
    beforeEach(async () => {
      setToday();
      ({ db, teardown } = await createTestDb());
    });

    async function setup(paceOpts?: { activeFromDay?: number; isActive?: boolean }) {
      const c = await makeCategory();
      await db.insert(budgets).values({ categoryId: c.id, month: MONTH_KEY, amount: 30_000 });
      await db.insert(paceAlertSettings).values({
        categoryId: c.id,
        threshold: 110,
        activeFromDay: paceOpts?.activeFromDay ?? 5,
        isActive: paceOpts?.isActive ?? true,
      });
      return c;
    }

    it("閾値超過（初回）で PaceAlert と Notification を作成", async () => {
      const c = await setup();
      // 7/10: ideal=10/31≈0.323, spent15000/30000=0.5 → pace_rate≈1.55*100=155 >= 110
      const t = await insertTx(c.id, 15_000);
      await evaluate(t.id);
      const alerts = await db.select().from(paceAlerts);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].recoveredAt).toBeNull();
      const notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.notifiableType, "PaceAlert"));
      expect(notifs).toHaveLength(1);
    });

    it("active_from_day より前は判定しない", async () => {
      vi.setSystemTime(new Date("2026-07-03T03:00:00+09:00")); // day 3 < 5
      const c = await setup({ activeFromDay: 5 });
      const t = await insertTx(c.id, 15_000);
      await evaluate(t.id);
      expect(await db.select().from(paceAlerts)).toHaveLength(0);
    });

    it("閾値未満なら作成しない", async () => {
      const c = await setup();
      const t = await insertTx(c.id, 3_000); // pace_rate 低い
      await evaluate(t.id);
      expect(await db.select().from(paceAlerts)).toHaveLength(0);
    });

    it("RED 継続中（未回復）なら重複作成しない", async () => {
      const c = await setup();
      await db.insert(paceAlerts).values({
        categoryId: c.id,
        month: MONTH_KEY,
        triggeredAt: new Date("2026-07-09T03:00:00+09:00"),
        recoveredAt: null,
      });
      const t = await insertTx(c.id, 15_000);
      await evaluate(t.id);
      expect(await db.select().from(paceAlerts)).toHaveLength(1);
    });

    it("回復済みの後に再度 RED なら新規作成", async () => {
      const c = await setup();
      await db.insert(paceAlerts).values({
        categoryId: c.id,
        month: MONTH_KEY,
        triggeredAt: new Date("2026-07-08T03:00:00+09:00"),
        recoveredAt: new Date("2026-07-09T03:00:00+09:00"),
      });
      const t = await insertTx(c.id, 15_000);
      await evaluate(t.id);
      expect(await db.select().from(paceAlerts)).toHaveLength(2);
    });

    it("閾値未満に回復したら最新アラートの recovered_at をセット", async () => {
      const c = await setup();
      const [alert] = await db
        .insert(paceAlerts)
        .values({
          categoryId: c.id,
          month: MONTH_KEY,
          triggeredAt: new Date("2026-07-05T03:00:00+09:00"),
          recoveredAt: null,
        })
        .returning();
      const t = await insertTx(c.id, 3_000); // 閾値未満
      await evaluate(t.id);
      const updated = (
        await db.select().from(paceAlerts).where(eq(paceAlerts.id, alert.id))
      )[0];
      expect(updated.recoveredAt).not.toBeNull();
    });
  });

  describe("refreshUnclassifiedAlert", () => {
    beforeEach(async () => {
      setToday();
      ({ db, teardown } = await createTestDb());
    });
    const refresh = () => db.transaction((tx) => refreshUnclassifiedAlert(tx));

    it("未分類が0件・既存アラートありなら削除（通知も削除）", async () => {
      const [a] = await db.insert(unclassifiedAlerts).values({ count: 3 }).returning();
      await db
        .insert(notifications)
        .values({ notifiableType: "UnclassifiedAlert", notifiableId: a.id });
      await refresh();
      expect(await db.select().from(unclassifiedAlerts)).toHaveLength(0);
      expect(
        await db
          .select()
          .from(notifications)
          .where(eq(notifications.notifiableType, "UnclassifiedAlert")),
      ).toHaveLength(0);
    });

    it("未分類が0件・アラートなしなら何もしない", async () => {
      await refresh();
      expect(await db.select().from(unclassifiedAlerts)).toHaveLength(0);
    });

    it("未分類ありで初回は作成（count と通知）", async () => {
      await insertTx(null, 100);
      await refresh();
      const alerts = await db.select().from(unclassifiedAlerts);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].count).toBe(1);
      expect(
        await db
          .select()
          .from(notifications)
          .where(eq(notifications.notifiableType, "UnclassifiedAlert")),
      ).toHaveLength(1);
    });

    it("既存ありなら count 更新のみ・通知は増やさない", async () => {
      const [a] = await db.insert(unclassifiedAlerts).values({ count: 1 }).returning();
      await db
        .insert(notifications)
        .values({ notifiableType: "UnclassifiedAlert", notifiableId: a.id });
      await insertTx(null, 100);
      await insertTx(null, 200);
      await refresh();
      const updated = (await db.select().from(unclassifiedAlerts))[0];
      expect(updated.count).toBe(2);
      expect(
        await db
          .select()
          .from(notifications)
          .where(eq(notifications.notifiableType, "UnclassifiedAlert")),
      ).toHaveLength(1);
    });
  });
  ```
- [ ] 失敗確認: 実行 `pnpm --filter web exec vitest run src/lib/alerts.test.ts`。期待: import 解決失敗（未実装）。
- [ ] `apps/web/src/lib/alerts.ts` を実装（spec §5.3/§5.4/§5.6。数式・状態遷移は Ruby 各 job と同一。サブスク trigger・メール送信は廃止のため呼ばない。`usage_percent` は整数格納のため `Math.trunc`）:
  ```ts
  import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
  import type { DbTransaction } from "../db/schema";
  import {
    budgets,
    budgetAlerts,
    budgetAlertSettings,
    notifications,
    paceAlerts,
    paceAlertSettings,
    transactions,
  } from "../db/schema";
  import { calcBudgetPace } from "./budget-pace";
  import { jstDateParts, jstEndOfDay, jstMonthRange, jstToday, monthKey } from "./dates";

  /** 取引 insert/update と同一 tx 内で、予算アラート(§5.3)とペースアラート(§5.4)を判定する。 */
  export async function evaluateAlertsForTransaction(
    tx: DbTransaction,
    transactionId: number,
  ): Promise<void> {
    const transaction = (
      await tx.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1)
    )[0];
    if (!transaction) return;

    const categoryId = transaction.categoryId;
    if (categoryId == null) return; // 未分類はアラート対象外

    await evaluateBudgetAlert(tx, categoryId, transaction.purchasedAt);
    await evaluatePaceAlert(tx, categoryId);
  }

  async function evaluateBudgetAlert(
    tx: DbTransaction,
    categoryId: number,
    purchasedAt: Date,
  ): Promise<void> {
    const { year, month } = jstDateParts(purchasedAt);
    const mKey = monthKey(year, month);

    const budget = (
      await tx
        .select()
        .from(budgets)
        .where(and(eq(budgets.categoryId, categoryId), eq(budgets.month, mKey)))
        .limit(1)
    )[0];
    if (!budget) return;

    const setting = (
      await tx
        .select()
        .from(budgetAlertSettings)
        .where(eq(budgetAlertSettings.categoryId, categoryId))
        .limit(1)
    )[0];
    if (!setting || !setting.isActive) return;

    const { start, end } = jstMonthRange(year, month);
    const spentRow = await tx
      .select({ spent: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.categoryId, categoryId),
          gte(transactions.purchasedAt, start),
          lte(transactions.purchasedAt, end),
        ),
      );
    const spent = Number(spentRow[0].spent);
    const usageRate = Math.round((spent / budget.amount) * 100 * 10) / 10;

    const thresholds = [setting.threshold, setting.threshold2].filter(
      (t): t is number => t != null,
    );

    for (const threshold of thresholds) {
      if (usageRate < threshold) continue;

      const existing = (
        await tx
          .select()
          .from(budgetAlerts)
          .where(
            and(
              eq(budgetAlerts.categoryId, categoryId),
              eq(budgetAlerts.month, mKey),
              eq(budgetAlerts.threshold, threshold),
            ),
          )
          .limit(1)
      )[0];
      if (existing) continue; // 同一閾値の重複送信を防ぐ

      const [inserted] = await tx
        .insert(budgetAlerts)
        .values({
          categoryId,
          month: mKey,
          threshold,
          usagePercent: Math.trunc(usageRate),
        })
        .returning({ id: budgetAlerts.id });
      await tx
        .insert(notifications)
        .values({ notifiableType: "BudgetAlert", notifiableId: inserted.id });
    }
  }

  async function evaluatePaceAlert(tx: DbTransaction, categoryId: number): Promise<void> {
    const setting = (
      await tx
        .select()
        .from(paceAlertSettings)
        .where(eq(paceAlertSettings.categoryId, categoryId))
        .limit(1)
    )[0];
    if (!setting || !setting.isActive) return;

    const today = jstToday();
    const { year, month, day } = jstDateParts(today);
    if (setting.activeFromDay > day) return; // 月初のデータ不足による誤判定を防ぐ

    const mKey = monthKey(year, month);
    const budget = (
      await tx
        .select()
        .from(budgets)
        .where(and(eq(budgets.categoryId, categoryId), eq(budgets.month, mKey)))
        .limit(1)
    )[0];
    if (!budget) return;

    const { start } = jstMonthRange(year, month);
    const spentRow = await tx
      .select({ spent: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.categoryId, categoryId),
          gte(transactions.purchasedAt, start),
          lte(transactions.purchasedAt, jstEndOfDay(today)),
        ),
      );
    const spent = Number(spentRow[0].spent);

    const result = calcBudgetPace({ budgetAmount: budget.amount, spentAmount: spent, date: today });

    const lastAlert = (
      await tx
        .select()
        .from(paceAlerts)
        .where(and(eq(paceAlerts.categoryId, categoryId), eq(paceAlerts.month, mKey)))
        .orderBy(desc(paceAlerts.triggeredAt))
        .limit(1)
    )[0];

    const paceRatePercent = result.paceRate * 100;

    if (paceRatePercent >= setting.threshold) {
      // RED 継続中（直近アラートが未回復）は再送しない
      if (lastAlert && lastAlert.recoveredAt == null) return;

      const [inserted] = await tx
        .insert(paceAlerts)
        .values({ categoryId, month: mKey, triggeredAt: new Date() })
        .returning({ id: paceAlerts.id });
      await tx
        .insert(notifications)
        .values({ notifiableType: "PaceAlert", notifiableId: inserted.id });
    } else {
      // 閾値未満（回復方向）: 未回復の直近アラートに recovered_at をセット
      if (lastAlert && lastAlert.recoveredAt == null) {
        await tx
          .update(paceAlerts)
          .set({ recoveredAt: new Date() })
          .where(eq(paceAlerts.id, lastAlert.id));
      }
    }
  }

  /** 未分類取引件数に応じて UnclassifiedAlert と通知を同期する(§5.6)。取引の再分類経路でも呼ぶ。 */
  export async function refreshUnclassifiedAlert(tx: DbTransaction): Promise<void> {
    const countRow = await tx
      .select({ c: sql<string>`count(*)` })
      .from(transactions)
      .where(isNull(transactions.categoryId));
    const count = Number(countRow[0].c);

    const existing = (await tx.select().from(unclassifiedAlerts).limit(1))[0];

    if (count === 0) {
      if (existing) {
        // notifications は FK を持たないためポリモーフィック参照を明示的に削除する
        await tx
          .delete(notifications)
          .where(
            and(
              eq(notifications.notifiableType, "UnclassifiedAlert"),
              eq(notifications.notifiableId, existing.id),
            ),
          );
        await tx.delete(unclassifiedAlerts).where(eq(unclassifiedAlerts.id, existing.id));
      }
      return;
    }

    if (existing) {
      await tx
        .update(unclassifiedAlerts)
        .set({ count })
        .where(eq(unclassifiedAlerts.id, existing.id));
      const notif = (
        await tx
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.notifiableType, "UnclassifiedAlert"),
              eq(notifications.notifiableId, existing.id),
            ),
          )
          .limit(1)
      )[0];
      if (!notif) {
        await tx
          .insert(notifications)
          .values({ notifiableType: "UnclassifiedAlert", notifiableId: existing.id });
      }
    } else {
      const [inserted] = await tx
        .insert(unclassifiedAlerts)
        .values({ count })
        .returning({ id: unclassifiedAlerts.id });
      await tx
        .insert(notifications)
        .values({ notifiableType: "UnclassifiedAlert", notifiableId: inserted.id });
    }
  }
  ```
  > 実装ノート: `unclassifiedAlerts` を import に追加すること（上記コードは参照済み）。`import { ..., unclassifiedAlerts } from "../db/schema"` を忘れない。
- [ ] `alerts.ts` の import 文に `unclassifiedAlerts` が含まれているか確認（`budgets, budgetAlerts, budgetAlertSettings, notifications, paceAlerts, paceAlertSettings, transactions, unclassifiedAlerts`）。
- [ ] パス確認: 実行 `pnpm --filter web exec vitest run src/lib/alerts.test.ts`。期待: 全 green。
- [ ] 全テスト・型チェック: 実行 `pnpm --filter web run test` と `pnpm --filter web exec tsc --noEmit`。期待: 全 green・型エラーなし。
- [ ] commit: `git add apps/web/src/lib/alerts.ts apps/web/src/lib/alerts.test.ts` → `git commit -m "feat(web): add budget/pace/unclassified alert evaluation"`

---

### Task 9: 設定系データ移行スクリプト `scripts/migrate-settings.ts`（1回きり）

**Files:**
- Create: `apps/web/scripts/migrate-settings.ts`

**Interfaces:**
- Produces: 実行スクリプト（`node apps/web/scripts/migrate-settings.ts`。Node 26 のネイティブ TS 実行を利用）。ローカル Rails PostgreSQL（`RAILS_DATABASE_URL`）→ Supabase（`DIRECT_URL`）へ `categories`/`budgets`/`store_category_mappings`/`budget_alert_settings`/`pace_alert_settings` を移行する。
- Consumes: `RAILS_DATABASE_URL`, `DIRECT_URL`, `src/db/schema.ts`（挿入先テーブル定義）。
- 備考: 履歴系（transactions/notifications/budget_alerts/pace_alerts/unclassified_alerts）は移行しない。ID 再採番のため旧ID→新ID マップを保持して参照整合性を維持する。

**Steps:**

- [ ] `apps/web/scripts/migrate-settings.ts` を作成（spec §10）:
  ```ts
  /**
   * 1回きりの設定系データ移行スクリプト（Rails PostgreSQL → Supabase）。
   * 実行: RAILS_DATABASE_URL=... DIRECT_URL=... node apps/web/scripts/migrate-settings.ts
   * 履歴データ（取引・通知・アラート履歴）は移行しない。
   */
  import postgres from "postgres";
  import { drizzle } from "drizzle-orm/postgres-js";
  import {
    schema,
    categories,
    budgets,
    storeCategoryMappings,
    budgetAlertSettings,
    paceAlertSettings,
  } from "../src/db/schema";

  type Row = Record<string, unknown>;

  async function main() {
    const railsUrl = process.env.RAILS_DATABASE_URL;
    const targetUrl = process.env.DIRECT_URL;
    if (!railsUrl) throw new Error("RAILS_DATABASE_URL is not set");
    if (!targetUrl) throw new Error("DIRECT_URL is not set");

    const src = postgres(railsUrl, { max: 1 });
    const targetClient = postgres(targetUrl, { max: 1 });
    const db = drizzle(targetClient, { schema });

    // 旧ID → 新ID の対応表
    const categoryIdMap = new Map<number, number>();

    try {
      // ---- categories ----
      // 自己参照(parent_id)があるため、まず parent_id なしで全件挿入し、後で更新する。
      const srcCategories = (await src`
        SELECT id, name, type, parent_id, color, sort_order
        FROM categories
        ORDER BY id
      `) as Row[];

      for (const c of srcCategories) {
        const kind = c.type === "FixedCategory" ? "fixed" : "variable";
        const [inserted] = await db
          .insert(categories)
          .values({
            name: c.name as string,
            kind,
            parentId: null,
            color: (c.color as string | null) ?? null,
            sortOrder: (c.sort_order as number) ?? 0,
          })
          .returning({ id: categories.id });
        categoryIdMap.set(c.id as number, inserted.id);
      }

      // parent_id を新IDへ張り替える
      const { eq } = await import("drizzle-orm");
      for (const c of srcCategories) {
        if (c.parent_id == null) continue;
        const newId = categoryIdMap.get(c.id as number)!;
        const newParentId = categoryIdMap.get(c.parent_id as number);
        if (newParentId == null) {
          throw new Error(`parent category not found for id=${c.id} parent_id=${c.parent_id}`);
        }
        await db.update(categories).set({ parentId: newParentId }).where(eq(categories.id, newId));
      }

      // ---- budgets ----
      const srcBudgets = (await src`
        SELECT category_id, month, amount FROM budgets ORDER BY id
      `) as Row[];
      for (const b of srcBudgets) {
        const newCategoryId = requireMapped(categoryIdMap, b.category_id as number, "budgets");
        await db.insert(budgets).values({
          categoryId: newCategoryId,
          month: toDateString(b.month),
          amount: b.amount as number,
        });
      }

      // ---- store_category_mappings（store_name を NFKC 正規化。not null/unique を検証）----
      const srcMappings = (await src`
        SELECT category_id, store_name FROM store_category_mappings ORDER BY id
      `) as Row[];
      const seenStoreNames = new Set<string>();
      for (const m of srcMappings) {
        if (m.store_name == null) {
          throw new Error(`store_category_mappings に null の store_name があります (category_id=${m.category_id})`);
        }
        const storeName = (m.store_name as string).trim().normalize("NFKC");
        if (seenStoreNames.has(storeName)) {
          throw new Error(`store_category_mappings に重複する store_name があります: ${storeName}`);
        }
        seenStoreNames.add(storeName);
        const newCategoryId = requireMapped(categoryIdMap, m.category_id as number, "store_category_mappings");
        await db.insert(storeCategoryMappings).values({ categoryId: newCategoryId, storeName });
      }

      // ---- budget_alert_settings（category_id は nullable）----
      const srcBudgetSettings = (await src`
        SELECT category_id, threshold, threshold_2, is_active FROM budget_alert_settings ORDER BY id
      `) as Row[];
      for (const s of srcBudgetSettings) {
        const newCategoryId =
          s.category_id == null
            ? null
            : requireMapped(categoryIdMap, s.category_id as number, "budget_alert_settings");
        await db.insert(budgetAlertSettings).values({
          categoryId: newCategoryId,
          threshold: s.threshold as number,
          threshold2: (s.threshold_2 as number | null) ?? null,
          isActive: (s.is_active as boolean) ?? true,
        });
      }

      // ---- pace_alert_settings（category_id は not null）----
      const srcPaceSettings = (await src`
        SELECT category_id, threshold, active_from_day, is_active FROM pace_alert_settings ORDER BY id
      `) as Row[];
      for (const s of srcPaceSettings) {
        const newCategoryId = requireMapped(categoryIdMap, s.category_id as number, "pace_alert_settings");
        await db.insert(paceAlertSettings).values({
          categoryId: newCategoryId,
          threshold: s.threshold as number,
          activeFromDay: (s.active_from_day as number) ?? 5,
          isActive: (s.is_active as boolean) ?? true,
        });
      }

      console.log("migration done:", {
        categories: srcCategories.length,
        budgets: srcBudgets.length,
        storeCategoryMappings: srcMappings.length,
        budgetAlertSettings: srcBudgetSettings.length,
        paceAlertSettings: srcPaceSettings.length,
      });
    } finally {
      await src.end();
      await targetClient.end();
    }
  }

  function requireMapped(map: Map<number, number>, oldId: number, table: string): number {
    const newId = map.get(oldId);
    if (newId == null) throw new Error(`${table}: category id ${oldId} の新IDが見つかりません`);
    return newId;
  }

  // Rails の date カラムは Date か 'YYYY-MM-DD' 文字列で返りうる。'YYYY-MM-DD' へ正規化する。
  function toDateString(value: unknown): string {
    if (value instanceof Date) {
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, "0");
      const d = String(value.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return String(value).slice(0, 10);
  }

  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
  ```
- [ ] 型チェック: 実行 `pnpm --filter web exec tsc --noEmit`。期待: 型エラーなし（実 DB 接続は行わない。実行はデプロイ準備フェーズで手動）。
- [ ] commit: `git add apps/web/scripts/migrate-settings.ts` → `git commit -m "feat(web): add one-off settings migration script"`

---

## セルフレビュー結果（spec 網羅・プレースホルダ・型整合）

- **spec 実装フェーズ1-3 網羅**: 基盤(Drizzle/schema/client/pglite・vitest)=Task1-4、純粋ロジック(budget-pace/monthly-summary/alerts/email-parser)=Task5-8、設定データ移行=Task9。§4 全11テーブル + 3 enum、§5.1-5.7 の数式・丸め・状態遷移、§6.1 パーサー仕様、§10 移行対象/非対象、§11 環境変数を反映済み。
- **固定インターフェース整合**: `db`(client.ts) / schema camelCase 全11テーブル / `Db`・`DbTransaction` / `parseSmbcEmail` / `calcBudgetPace` / `evaluateAlertsForTransaction`・`refreshUnclassifiedAlert` / `getMonthlySummary` / dates 関数群 — すべてタスク内で完全なシグネチャと実コードで定義。`DbTransaction` は `PgTransaction<any, ...>`、`Db` は共通基底 `PgDatabase<any, ...>` にして postgres-js/pglite 双方で受け取れるようにした。
- **プレースホルダ不使用**: 全ステップに実コード全文。TBD・「適切に」・「Task N と同様」は無し。
- **fixture 破損への対処を明記**: `.eml` の ESC 欠落・ラベル `ご` 無しの2点は実バイト列で検証済み。テストヘルパで ESC 再挿入 + U+FFFD 除去、パーサー正規表現は `(?:ご)?` で spec の上位互換。抽出結果（433/セブン-イレブン/2026-07-08T07:22:00Z、1076/BELC WAKOSHIRAKO/2026-07-08T14:24:00Z）を Node 実行で確認済み。
- **Ruby との差異は意図通り**: サブスク trigger・メール送信は移行対象外(廃止)のため呼ばない。非同期ジョブ→同期実行(§5.5)。`calcBudgetPace` は spent を引数化した純粋関数（budget 有無は呼び出し側判定）で、Ruby の戻り値のうち monthly-summary が必要とする budget_amount/remaining は呼び出し側で補完。
- **既知の留意点（実装者向け）**: (1) `alerts.ts` は `unclassifiedAlerts` の import 漏れに注意（ステップに確認項目あり）。(2) pace テストは `vi.setSystemTime` で「今日」を固定するため実行日に非依存。(3) `node scripts/migrate-settings.ts` は Node 22+ のネイティブ TS 実行前提（環境の Node は 26.4）。
