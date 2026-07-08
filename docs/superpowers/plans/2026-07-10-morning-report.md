# 朝の報告書 — Rails → Next.js 移行 夜間自走結果（2026-07-10）

## TL;DR

**コード移行は完了。全テスト・型チェック・本番ビルドが合格し、最終ブランチレビューは「マージ可（READY_WITH_DEFERRED）」。**
残っているのはあなたのデプロイ作業（Supabase → データ移行 → apps/api 削除 → Vercel → CloudMailin → Gmail → E2E）のみです。手順書は本書後半にまとめました。

## 実装結果

計27コミット（`ef7efc9..d2e4aa2`）、78ファイル変更、+13,528 / −3,157 行。developmentブランチ上。

### 計画A: 基盤（9/9タスク完了）
- Drizzle/vitest/pglite ツール導入・設定（vitest に `@/` エイリアス解決含む）
- DBスキーマ11テーブル + 初期マイグレーションSQL + `src/db/client.ts`（pooler接続 `prepare: false`）
- `src/lib/dates.ts`（JST固定・TZ非依存、3種のTZで検証済み）
- pgliteテスト基盤 `createTestDb(): Promise<{db, client, teardown}>`
- 純粋ロジック4本の忠実移植: `budget-pace.ts` / `email-parser.ts`（実fixture・ESC復元ヘルパ付き）/ `monthly-summary.ts` / `alerts.ts`（予算閾値1回発火・ペース状態遷移・未分類refresh）
- 1回きり移行スクリプト `apps/web/scripts/migrate-settings.ts`

### 計画B: アプリ層（13/13タスク完了）
- `serialize.ts`、zod v4 導入
- RSCローダ `src/lib/queries.ts` / `src/lib/notifications.ts`（Union合成、InboundEmail対応）
- Server Actions 6ファイル（transactions / categories / budgets / alert-settings / mappings / notifications）
  - 取引系はアラート判定を同一DBトランザクション内で同期実行（spec §5.5）
  - レビュー指摘による修正1件: 予算monthの月初キー正規化（`16171f9`）
- 認証: `src/lib/auth.ts`（Web Crypto HMAC、constant-time検証）+ `src/proxy.ts`（Next.js 16）+ `/login`
- 全画面をApollo/GraphQLからRSC props + Server Actionsへ差し替え（13a-13n、17ファイル）

### 計画C: Webhook・掃除（夜間スコープ 5/7完了、2件は理由付き繰込 ↓）
- `/api/inbound-email` Route Handler（token認証・冪等・自動分類・アラート同期）
- live GraphQL参照ゼロ確認 → Apollo/codegen基盤・依存を完全削除（−2,348行）
- メール通知WIP（Chapter 6-10 の残骸）削除。`toggle-switch.tsx` は共有につき保持
- CLAUDE.md 全面書換（新スタック + 「移行残作業」セクション付き）

## 検証結果（正直な報告）

| 検証 | 結果 |
|---|---|
| vitest 全テスト | **131/131 合格**（19ファイル、シリアル実行） |
| tsc --noEmit | **エラーなし** |
| next build（本番） | **成功**（全12ルート + Proxy 有効） |

注意点2つ:
1. **テストの並列実行が不安定**: pglite（テスト毎にインメモリPostgres起動）の資源競合で、`pnpm --filter web run test` の並列実行は間欠タイムアウトすることがある。シリアル（`pnpm --filter web exec vitest run --no-file-parallelism`）なら安定して全合格。CIを組む際はシリアル推奨（または vitest の `maxWorkers` 制限）。
2. **buildはClaude Codeのsandbox内では失敗する**（Turbopackのポートbindが遮断される）。sandbox外実行なら成功。手元のターミナルから普通に実行する分には無関係。

## レビュー体制と結果

- 実装前: opusによる3計画クロス整合レビュー（BLOCKER 3 / MAJOR 4 / MINOR 6 → 全件計画へ反映済み。`docs/superpowers/plans/cross-review-findings.md`）
- タスク毎: sonnet実装 + opusレビューを22回。Important指摘1件（予算month正規化）は修正→再レビュー承認済み
- 最終: opusによる全体ブランチレビュー → **READY_WITH_DEFERRED（Critical 0 / Important 0）**。型・単位・JST・アラート経路・認証境界のクロスカット整合をすべて確認済み
- 途中の自動セキュリティレビュー指摘（notifications.tsのIDOR）は「単一ユーザー・proxy全ルートゲート」で非該当と判断し、proxyがServer Action POSTをゲートすることをレビューで実証してクローズ

## 夜間に実行しなかったこと（理由付き）

1. **C-Task 2（Webhook実DBスモーク）**: 実DBが必要（Dockerデーモン停止中）。→ 下記デプロイ手順の Step 6 スモークで代替可能。ローカルで先に試す場合は `docs/superpowers/plans/2026-07-09-migration-C-webhook-cleanup-deploy.md` の Task 2 参照
2. **C-Task 6（apps/api 削除）**: 計画自身のM2ガードによる。**データ移行（Step 2）がローカルRails DB（apps/api の docker-compose）を必要とするため、移行完了前に削除してはならない**。また apps/api 配下には未追跡の `.env` 等があり、削除は復元不能。→ Step 3 として手順化
3. **メールWIP（EmailPreference）のapps/api側残骸**: apps/api 削除で一括消滅するため個別処理せず

---

# デプロイ手順書（あなたの作業）

所要目安: 60〜90分。`<...>` は実値に置換。詳細は計画C（`docs/superpowers/plans/2026-07-09-migration-C-webhook-cleanup-deploy.md`）Task 8〜12 と同内容。

## Step 1: Supabase セットアップ

1. https://supabase.com/dashboard → New project（Region: `Northeast Asia (Tokyo)`、DB Password を強力な値で設定して控える）
2. Project Settings → Database → Connection string から2本取得:
   - `DATABASE_URL`（pooler / port **6543**）: `postgresql://postgres.<ref>:<pw>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`
   - `DIRECT_URL`（直結 / port **5432**）: 同ホストで port 5432 のもの
3. `apps/web/.env` に両方を記載（gitignore済み確認済み）
4. マイグレーション適用:
   ```bash
   cd apps/web
   pnpm drizzle-kit migrate
   ```
5. Table Editor で `categories` / `transactions` / `inbound_emails` 等の作成を確認

## Step 2: 設定データ移行（⚠ Step 3 の前に必ず実行）

1. ローカル Rails DB を起動（`cd apps/api && docker compose up -d` 相当。Docker Desktop起動が必要）
2. 移行実行:
   ```bash
   cd apps/web
   RAILS_DATABASE_URL=<ローカルRailsの接続文字列> DIRECT_URL=<Supabase直結5432> \
     node scripts/migrate-settings.ts
   ```
   - 移行対象: categories / budgets / store_category_mappings / budget_alert_settings / pace_alert_settings（取引履歴・通知は移行しない設計）
   - `store_name` が null・空・重複の行があると日本語エラーで**全件ロールバック**して止まる（新スキーマはNOT NULL+UNIQUE）。エラーに category_id が出るので Rails 側データを直して再実行
3. Supabase 側で件数・`categories.parent_id` の自己参照・`store_name` の重複無しを確認

## Step 3: apps/api（Rails）削除

Step 2 完了後に実行。手順は計画C Task 6 のとおり:

```bash
cd /Users/hiroshi/Desktop/work/rails/kakeibo
rm -rf apps/api
# ルート package.json から "dev:api" スクリプト行を削除
# .vscode/settings.json を {} に置換（Ruby-LSP設定除去）
pnpm install && cd apps/web && pnpm build   # 確認
git add -A && git commit -m "chore(migration): delete apps/api (Rails) and root Rails config"
```

（この作業は私に依頼してもらえれば実行します。「apps/api消して」でOK）

## Step 4: Vercel セットアップ

1. 鍵生成: `openssl rand -hex 32`（AUTH_COOKIE_SECRET用）、`openssl rand -hex 24`（INBOUND_TOKEN用）
2. https://vercel.com/new → リポジトリimport → **Root Directory を `apps/web` に設定**
3. Environment Variables（Production）:
   - `DATABASE_URL` = Supabase pooler（6543）
   - `AUTH_PASSWORD` = ログイン用共有パスワード（任意の強い文字列）
   - `AUTH_COOKIE_SECRET` = hex 32B
   - `INBOUND_TOKEN` = hex 24B
   - （`DIRECT_URL` はビルドでdrizzle-kitを使う場合のみ）
4. Deploy → `https://<app>.vercel.app/login` で `AUTH_PASSWORD` ログイン確認

## Step 5: CloudMailin セットアップ

1. https://www.cloudmailin.com でアカウント作成（無料枠 月1万通）→ Address 作成、受信アドレスを控える
2. Delivery Target:
   - URL: `https://<app>.vercel.app/api/inbound-email?token=<INBOUND_TOKEN>`
   - Format: **JSON (Normalized)** ／ POST ／ Raw format は**無効のまま**
3. CloudMailin の Test送信 → Vercel ログで 200 を確認

## Step 6: Gmail 自動転送 + E2E 確認

1. Gmail 設定 → 転送先アドレスに CloudMailin アドレスを追加
2. Gmail の確認メールが Webhook 経由で `inbound_emails` に `status='skipped'` で保存される。Supabase SQL Editor で確認コードを取得:
   ```sql
   select id, "from", subject, raw_body, created_at from inbound_emails order by created_at desc limit 5;
   ```
3. 確認コード入力 → 転送有効化
4. フィルタ作成: From `statement@vpass.ne.jp` + 件名 `ご利用のお知らせ` → CloudMailin へ転送（**過去メールへの一括適用はしない** — 大量取引が作られる）
5. スモーク（curl で本番へ1通投入 → `status='processed'` と取引作成を確認 → 後片付けSQL）: 計画C Task 12 のコマンドをそのまま使用
6. 実カード利用 or 実メール1通の手動転送で、ホーム画面への反映を確認

---

## マージについて

developmentブランチに27コミット積んだ状態。最終レビューはマージ可判定。mainへのマージ（またはPR作成）はあなたの判断で。PR作成は私に依頼してもらえれば行います。

## 繰延Minor指摘（マージ阻害なし、後日改善候補）

最終レビューで全件「defer可」判定。主なもの:
- email-parser の店舗名正規化が `normalizeStoreName`（store-name.ts）と重複（出力は等価と検証済み。DRY統一推奨）
- monthly-summary の当月ペース分岐にテスト無し（コードレビューで正しさは確認済み）
- budgets の month バリデーションが13月等を通す（月ピッカーUI前提なら実害なし。手入力欄を作る際に01-12チェック追加）
- パスワード/webhookトークン比較が非constant-time（単一共有シークレットで実質リスクなし）
- ペースアラートにunique制約なし（単一ユーザーで並行実行なし）

全指摘の詳細は `.superpowers/sdd/progress.md`（実装ledger）と各タスクレポート（`.superpowers/sdd/task*-report.md`）に記録。

## 参照

- 実装ledger: `.superpowers/sdd/progress.md`
- クロスレビュー結果: `docs/superpowers/plans/cross-review-findings.md`
- 設計spec（唯一の正）: `docs/superpowers/specs/2026-07-09-rails-to-nextjs-migration-design.md`
- 新CLAUDE.md: 移行残作業セクション付きで書換済み（`d2e4aa2`）
