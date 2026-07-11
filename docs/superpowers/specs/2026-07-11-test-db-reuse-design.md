# pglite テストDB 再利用による flaky 解消 設計書

日付: 2026-07-11
ステータス: 承認済み（アプローチA）

## 背景・問題

テストスイートを並列実行すると、pglite 系テストが `Hook timed out in 20000ms`（`createTestDb()`
内の PGlite/WASM 起動 + マイグレーション適用）で不定期に失敗する。アサーション失敗は無く、
逐次実行（`--fileParallelism=false`）では 206/206 green。

原因: 一部のテストファイルが **beforeEach ごとに** `createTestDb()` を呼び、スイート全体で
100 個超の PGlite インスタンスを生成するため、並列実行時に起動が輻輳して 20 秒を超える。

`actions/*.test.ts` は「ファイルで1回生成 + beforeEach でテーブル削除」パターンで、この問題がない。

## 方針（アプローチA: 根本原因の修正）

タイムアウト延長や並列数制限（対症療法）ではなく、DB 使い捨てをやめる。
全 pglite テストを「**ファイルで1回生成 + beforeEach でリセット**」パターンへ統一する。

## 変更内容

### 1. 共通ヘルパ `resetTestDb`（`apps/web/src/test/db.ts` に追加）

```ts
export async function resetTestDb(client: PGlite): Promise<void>
```

- `pg_tables`（`schemaname = 'public'`）から全テーブル名を動的に列挙し、
  `TRUNCATE TABLE <全テーブル> RESTART IDENTITY CASCADE` を1文で実行する。
- `RESTART IDENTITY` によりシーケンスもリセットされ、「新規DB」と同じ id 採番になる
  （既存テストの id 期待値が壊れない）。
- テーブル列挙を動的にすることで、スキーマにテーブルが増えてもヘルパの修正が不要。
- drizzle のマイグレーション管理テーブルは `drizzle` スキーマにあるため対象外（public のみ）。

### 2. beforeEach で `createTestDb()` している7ファイルの書き換え

対象（現状 beforeEach ごとに新規DB）:

- `src/lib/queries.test.ts`
- `src/lib/notifications.test.ts`
- `src/lib/effective-budget.test.ts`
- `src/lib/monthly-summary.test.ts`（describe 7ブロック）
- `src/lib/alerts.test.ts`（describe 3ブロック）
- `src/app/api/inbound-email/route.test.ts`
- `src/test/schema-smoke.test.ts`

変換パターン（`actions/*.test.ts` と同型）:

- トップレベルで1回 `const { db, client, teardown } = await createTestDb()`
- `beforeEach(() => resetTestDb(client))`
- `afterAll(() => teardown())`
- describe ごとの生成・破棄（beforeEach/afterEach 内の createTestDb/teardown）は削除
- テスト本体・アサーションは変更しない

### 3. `actions/*.test.ts` の beforeEach も `resetTestDb` へ統一（DRY）

現状の「対象テーブルを列挙して `db.delete(t)`」は、テーブル追加時に消し漏れが起きる。
`resetTestDb(client)` に置き換えて単一の信頼できる情報源にする。

対象: `actions/{alert-settings,auth,budgets,categories,inbound-emails,mappings,notifications,transactions}.test.ts`
のうち pglite を使うもの（auth は DB 不使用なら対象外）。

## 変更しないもの

- `vitest.config.ts` のタイムアウト値（20s のまま。輻輳が消えれば十分）
- テストのアサーション・テストケース構成
- `createTestDb()` 本体のシグネチャ

## 成功基準

- `vitest run`（並列デフォルト）を3回連続で全件 green
- スイート実行時間が現状（正常時 ~50-100s）から悪化しない（PGlite 生成が 100+ → 23 回に減るため短縮見込み）
