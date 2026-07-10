# かけいぼ プロジェクト

## 概要
個人用・単一ユーザーの家計簿アプリ。クレカ利用通知メールを Gmail 自動転送 → CloudMailin
Webhook 経由で受信し、当日中に自動で取引記録する。食費の予算オーバーを防ぐことがコア目的。
Next.js フルスタック（App Router + Drizzle ORM）構成で、旧 Rails/GraphQL 構成からは全面移行済み。

## 技術スタック
- フルスタック: Next.js 16（App Router / RSC / Route Handler / Server Actions）
- ORM: Drizzle ORM（`postgres-js` ドライバ、Supabase pooler 経由）
- DB: Supabase PostgreSQL（RLS 不使用・サーバー側接続のみ）
- バリデーション: zod
- メール受信: CloudMailin（Normalized JSON Webhook）
- 認証: 共有パスワード + HMAC 署名 cookie（Web Crypto API、`src/proxy.ts`。Next.js 16 で
  `middleware.ts` から改称）
- テスト: Vitest（純粋ロジックのユニット + `@electric-sql/pglite` による DB 統合テスト）
- ホスティング: Vercel（apps/web を Root Directory に）

## ディレクトリ構成
- apps/web/        → Next.js フルスタックアプリ（唯一のアプリ）
  - src/db/          → Drizzle スキーマ・クライアント
  - src/lib/         → 純粋ロジック（budget-pace / monthly-summary / alerts / email-parser /
    store-name / dates）
  - src/actions/     → Server Actions（更新系）
  - src/app/api/inbound-email/ → メール受信 Webhook
  - src/test/        → pglite テスト基盤
  - scripts/         → 1回きりの移行スクリプト等
- docs/            → 要件定義書・設計書・実装計画

## アーキテクチャ要点
- 取引記録・アラート判定は「取引 insert と同一DBトランザクション内で同期実行」する
  （旧 Sidekiq/cron は廃止。支出発生時にのみ判定すればバッチと同結果、という設計根拠）。
- 日付演算（月初・末日・経過日数）は Asia/Tokyo 固定で `src/lib/dates.ts` に集約する。
  実行環境TZ（Vercel は UTC）に依存させない。
- `db/client.ts` はアプリ実行時の pooler 接続（`prepare: false` 必須）。DDL は `DIRECT_URL` 直結。
- 店舗名の正規化（全角/半角統一・トリム等）は `src/lib/store-name.ts` の `normalizeStoreName`
  に集約する（マッピング画面の Server Action 等から利用）。

## 開発ルール
- TDD で進める（テスト先行で Red を確認 → 実装 → Green）。
  - 純粋ロジック（`src/lib/*`）は Vitest のユニットテスト、Server Actions / Webhook は
    pglite 統合テストでカバーする。
- コミットは Conventional Commits 形式（feat: / fix: / chore: / test: / refactor: / docs:）。
- main への直接コミットは避け、作業ブランチを切る。
- 外部入力（メール本文・フォーム）は必ず検証し、失敗ケースもテストで押さえる。

## 移行残作業
1. **本番環境セットアップ**: Vercel / CloudMailin / Gmail 自動転送の設定。手順は
   `docs/superpowers/plans/2026-07-10-morning-report.md` の Step 4〜6（または計画C の Task 9〜12）を参照。

（完了済み: Supabase セットアップ・マイグレーション適用は 2026-07-10 実施。Rails 版は実運用データ
未投入だったため設定データ移行は不要と確認し、`apps/api` は削除済み。カテゴリ・予算は Next.js 版で
新規登録する。`scripts/migrate-settings.ts` は役目を終えたが1回きりスクリプトとして残置。）

## 進捗
Rails → Next.js フルスタックへのコード移行・`apps/api` 削除は完了。残りは本番環境セットアップのみ。
以降の機能追加は apps/web 内で行う。

参照: `docs/superpowers/specs/2026-07-09-rails-to-nextjs-migration-design.md`（移行設計書＝仕様の正）

## 環境変数
- `DATABASE_URL`     : Supabase pooler（transaction-mode, port 6543）。実行時接続、`prepare: false`
- `DIRECT_URL`       : Supabase 直結（port 5432）。drizzle-kit の DDL 用
- `AUTH_PASSWORD`    : ログイン共有パスワード
- `AUTH_COOKIE_SECRET`: 認証 cookie の HMAC 署名鍵
- `INBOUND_TOKEN`    : CloudMailin Webhook の URL トークン

## 参照ドキュメント
- 移行設計書: docs/superpowers/specs/2026-07-09-rails-to-nextjs-migration-design.md
- 実装計画: docs/superpowers/plans/
