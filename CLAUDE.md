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
- apps/api/        → 旧 Rails アプリ（移行残作業1・2の完了後に削除予定。下記「移行残作業」参照）
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
Rails → Next.js フルスタックへのコード移行（アプリ実装）は完了しているが、以下のユーザー実行作業が
未完了のため `apps/api` はまだリポジトリに残っている。

1. **Supabase セットアップ + 設定データ移行**: Supabase プロジェクトを作成し、
   `scripts/migrate-settings.ts` を実行して categories / budgets / store_category_mappings /
   budget_alert_settings / pace_alert_settings をローカル Rails DB（`RAILS_DATABASE_URL`）から
   Supabase（`DIRECT_URL`）へ移行する。
2. **`apps/api` 削除**: 残作業1の完了後に実施する。手順は
   `docs/superpowers/plans/2026-07-09-migration-C-webhook-cleanup-deploy.md` の Task 6 を参照
   （M2 ガード: この順序を逆にするとローカル Rails DB を起動できず移行スクリプトが動かせなくなる
   ため、Task 6 は残作業1の完了を待って実行すること）。
3. **本番環境セットアップ**: Vercel / CloudMailin / Gmail 自動転送の設定。手順は同計画書の
   Task 9〜12 を参照。

## 進捗
Rails → Next.js フルスタックへのコード移行は完了。上記「移行残作業」（デプロイ関連のユーザー作業と
`apps/api` 削除）を残すのみ。以降の機能追加は apps/web 内で行う。

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
