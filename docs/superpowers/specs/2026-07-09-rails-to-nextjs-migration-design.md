# かけいぼ: Rails → Next.js フルスタック移行 設計書

- 作成日: 2026-07-09
- 対象: apps/api（Rails）を廃止し、apps/web（Next.js）へ全機能を統合する

## 1. 背景と目的

現行のかけいぼは Rails 8.1（GraphQL-Ruby + Sidekiq + Action Mailer）と Next.js 16（Apollo
Client + GraphQL codegen）の2アプリ構成である。個人用・単一ユーザーの家計簿アプリであり、
未デプロイの段階にある。

この構成には以下の課題がある。

- Rails と Next.js を両方無料枠でホストする先（Railway + Vercel）が必要になり、運用対象が増える
- GraphQL層（スキーマ・Resolver・Mutation・Apollo・codegen）が、単一ユーザーアプリの割に
  過剰な抽象化になっている
- 現行の取引記録フローは「クレカ利用通知メールを iPhone ショートカットが Gmail から読み取り、
  REST API に POST する」という、iPhone依存かつ手動トリガーの仕組みである

これらを解消するため、**Next.js フルスタック構成に全面移行し、Rails を廃止する**。移行後は
Vercel + Supabase + CloudMailin の無料枠のみでインフラが完結し、取引記録は「Gmail自動転送 →
メールWebhook」による完全自動化に置き換わる。

## 2. スコープ

### 2.1 対象（新規実装・移植する機能）

- 取引（transaction）記録・一覧・カレンダー表示
- カテゴリ管理（固定費・変動費、親子階層）
- 予算管理（カテゴリ×月）
- 予算アラート（2段階閾値）・ペースアラート（状態遷移ベース）・未分類アラート
- 店舗名 → カテゴリの自動マッピング
- アプリ内通知
- ホーム画面の月次サマリー（予算消化ペース含む）
- メール受信によるクレカ利用の自動取引記録（新規）
- 共有パスワードによる簡易認証（新規）

### 2.2 廃止する機能

- GraphQL 全般: GraphQL-Ruby スキーマ・Resolver・Mutation・Apollo Client・codegen・
  `apps/web/src/gql` 以下
- Sidekiq / Active Job（`sidekiq-cron` による定期実行を含む）
- Action Mailer によるメール送信機能全部（予算アラートメール・ペースアラートメール・
  月次サマリーメール）
- Active Storage（取引への写真添付機能ごと廃止。UIも含む）
- GraphQL Subscription（Action Cable によるリアルタイム通知配信）
- REST `/api/v1/transactions`（iPhoneショートカット向けエンドポイント）
- `EmailPreference`（メール送信ON/OFF設定。メール送信自体を廃止するため不要）
- cron 類全般（`sidekiq-cron` の schedule 定義）
- Railway へのデプロイ計画（Rails自体を廃止するため対象外になる）
- `apps/api` ディレクトリ全体（最終フェーズで削除）
- `apps/web/src/app/settings/mail`（メール通知設定画面。送信機能廃止に伴い不要）

### 2.3 非対象（今回のスコープに含めない）

- E2Eテスト整備（個人アプリのため手動確認で足りると判断）
- 複数ユーザー対応・本格的な認証基盤（OAuth等）
- 取引履歴・通知・アラート履歴のデータ移行（設定系のみ移行し、履歴データは移行しない）
- 複数カード会社・複数メールフォーマットへの対応（パーサーは1社分のみ実装）

## 3. アーキテクチャ

```
カード会社 → Gmail → フィルタ転送 → CloudMailin
                                      ↓ JSON Webhook (URLトークン検証)
Vercel: Next.js (apps/web を in-place 改造)
  /api/inbound-email Route Handler
    → 冪等性チェック → パース → 取引insert + アラート判定 + 通知insert（同一DBトランザクション）
  RSC（画面表示、Drizzleで直接クエリ）
  Server Actions（更新系、zodバリデーション + revalidatePath）
  middleware.ts（パスワードcookie認証）
        ↕ Drizzle ORM（Supabase pooler経由 port 6543）
Supabase PostgreSQL（RLS不使用、サーバー側接続のみ）
```

インフラは全て無料枠で構成する。

- **Vercel**: Next.js のホスティング（RSC・Route Handler・Server Actions）
- **Supabase**: PostgreSQL 本体
- **CloudMailin**: メール受信を JSON Webhook として受け取るサービス（無料枠 月1万通）

Supabase への接続は `postgres-js` ドライバを使う。接続先は用途によって2種類使い分ける。

- **アプリ実行時（`db/client.ts`）**: `DATABASE_URL`（transaction-mode pooler、port 6543）に
  `prepare: false` を必須で指定する。Supabase の transaction-mode pooler は prepared
  statements に対応していないため、`prepare: false` を付けないと接続エラーになる
- **drizzle-kit（DDL・マイグレーション）**: pooler 経由では DDL 実行に問題が出ることがあるため、
  `DIRECT_URL`（port 5432 直結）を別途定義し、`drizzle-kit generate` / `drizzle-kit migrate`
  はこちらを使う（11章の環境変数一覧参照）

単一ユーザー・未デプロイという前提のもと、サーバー・DBを分離するメリット（水平スケール、
別言語での並行開発）を捨て、Next.js 単体に寄せることでインフラ運用コストと認知負荷を下げる
のが狙いである。

### 3.1 ディレクトリ構成（apps/web 内、新規/変更分）

```
apps/web/src/
  db/
    schema.ts          # Drizzleスキーマ定義
    client.ts           # Supabase pooler接続クライアント
  lib/
    budget-pace.ts       # BudgetPaceCalculator 相当（純粋関数）
    monthly-summary.ts   # MonthlySummaryService 相当（純粋関数）
    alerts.ts            # BudgetAlertJob + PaceAlertJob + UnclassifiedAlertJob 相当
    email-parser.ts       # クレカ利用通知メールのパーサー
  actions/
    transactions.ts
    categories.ts
    budgets.ts
    alert-settings.ts
    mappings.ts
    notifications.ts
  app/
    api/inbound-email/route.ts
    login/page.tsx
    （既存の画面ルートはデータ層のみ差し替え。3.2節・8章参照）
  middleware.ts
```

`src/lib` 配下は DB アクセスを持たない、あるいは呼び出し元から Drizzle クライアントや
既取得データを引数で受け取る形にし、純粋関数としてユニットテストしやすくする（9章参照）。

### 3.2 タイムゾーン戦略

現行 Rails は `Time.zone = "Asia/Tokyo"` の設定下で `Date.current` や
`beginning_of_month` 等が JST 基準で動作している。Next.js 移行後もこの意味論を
崩さないよう、タイムゾーンの扱いを以下の方針に統一する。

- DB の timestamp 系カラムは `purchased_at` を含め全て `timestamptz`（timezone付き
  timestamp）に統一する。DB には常に UTC の絶対時刻として保存し、タイムゾーンの解釈は
  アプリケーション層でのみ行う
- 「今日の日番号」「月初・月末境界」「経過日数」など、日付演算が絡む業務ロジック
  （5章の `budget-pace.ts` / `monthly-summary.ts` / `alerts.ts` 等）は、全て
  **Asia/Tokyo 固定** で計算する。サーバーの実行環境タイムゾーン（Vercel は UTC）に
  依存させない
- これらのユーティリティは `src/lib/dates.ts` に集約する。少なくとも以下を定義し、
  ビジネスロジック側はこれ以外の手段（`new Date()` の素の比較や `Date#getMonth()` 等）
  で日付演算を行わない。
  - `jstToday()`: JST での「今日」の日付を返す
  - `jstMonthRange(year, month)`: 指定年月の JST での月初〜月末の範囲を返す
  - `jstDaysInMonth(year, month)`: JST での指定月の末日の日番号を返す
  - `jstDayOfMonth(date)`: JST での指定日時の日番号を返す
- 実装は `Intl.DateTimeFormat`（`timeZone: 'Asia/Tokyo'`）ベース、または UTC 時刻に
  +9時間する手計算のいずれかで行う。`date-fns-tz` 等の外部ライブラリは導入しない
- Ruby の `Date.current` / `beginning_of_month` / `end_of_day` 相当の意味論
  （「その瞬間の JST での日付・月初・日末」）を `dates.ts` の関数群で再現する、という
  対応関係を実装時の指針とする

## 4. DBスキーマ

Drizzle ORM で定義する。全テーブル共通で `id`（bigserial PK）、`created_at`・`updated_at`
（timestamp）を持つ点は現行 Rails スキーマを踏襲する。

### 4.1 現行 Rails スキーマからの変更点

- **categories**: STI の `type`（文字列, `"FixedCategory"` / `"VariableCategory"`）を
  廃止し、`kind` pgEnum（`'fixed' | 'variable'`）に置き換える。`parent_id` の自己参照、
  `color`、`sort_order` は維持する。`transactions_count` カウンタキャッシュは廃止する
  （Rails の `counter_cache` 機能に依存していたもので、Drizzle移行後は使用箇所がないため）。
  UI 側（`apps/web`）で `"FixedCategory"` / `"VariableCategory"` という STI クラス名を
  文字列としてハードコードしている箇所も、`'fixed'` / `'variable'`（DB の `kind` enum値と
  同一の文字列）にそのまま置き換える定数更新を行う。DB値とUI表示用の値が異なるわけでは
  ないため、Server Action 側に変換・マッピング層は設けない
- **transactions**: `source` を文字列カラムから pgEnum（`'email' | 'manual'`）に変更する。
  `amount`（正整数）・`memo`・`purchased_at`・`store_name`・`category_id`（nullable）は
  維持する。写真関連カラム・関連（Active Storage経由）は持たない
- **budgets**: `category_id × month` の一意制約を維持する
- **store_category_mappings**: 現行 Rails では `store_name` はカラムとして nullable
  （DBレベルの一意制約もなし）で、一意性はモデルバリデーション（アプリ層）のみで
  担保されている。移行後の Drizzle スキーマ（4.2節）では `store_name` を意図的に
  `not null unique`（DB制約）に強化する。データ移行（10章）時点で重複・null が
  存在しないことを移行スクリプトで確認する
- 廃止テーブル: `active_storage_attachments` / `active_storage_blobs` /
  `active_storage_variant_records`（写真添付機能の廃止に伴う）、`email_preferences`
  （メール送信機能の廃止に伴う）

### 4.2 テーブル定義

```
categories
  id bigserial PK
  name varchar not null
  kind category_kind_enum('fixed' | 'variable') not null
  parent_id bigint FK -> categories.id (nullable, 自己参照)
  color varchar
  sort_order integer not null default 0
  created_at, updated_at

transactions
  id bigserial PK
  amount integer not null            -- 正整数
  memo varchar
  purchased_at timestamp not null
  store_name varchar not null
  category_id bigint FK -> categories.id (nullable)  -- 未分類はnull
  source transaction_source_enum('email' | 'manual') not null
  created_at, updated_at
  index: category_id, purchased_at, source

budgets
  id bigserial PK
  category_id bigint FK -> categories.id not null
  month date not null
  amount integer not null
  unique(category_id, month)
  created_at, updated_at

budget_alert_settings
  id bigserial PK
  category_id bigint FK -> categories.id (nullable)
  threshold integer not null          -- 例: 80
  threshold_2 integer (nullable)      -- 例: 100
  is_active boolean not null default true
  created_at, updated_at

budget_alerts
  id bigserial PK
  category_id bigint FK -> categories.id not null
  month date not null
  threshold integer not null
  usage_percent integer not null
  unique(category_id, month, threshold)   -- 重複送信防止の要
  created_at, updated_at

pace_alert_settings
  id bigserial PK
  category_id bigint FK -> categories.id not null
  threshold integer not null          -- 例: 110（%）
  active_from_day integer not null default 5
  is_active boolean not null default true
  created_at, updated_at

pace_alerts
  id bigserial PK
  category_id bigint FK -> categories.id not null
  month date not null
  triggered_at timestamp not null
  recovered_at timestamp (nullable)   -- null = まだRED状態が継続中
  created_at, updated_at

store_category_mappings
  id bigserial PK
  category_id bigint FK -> categories.id not null
  store_name varchar not null unique
  created_at, updated_at

unclassified_alerts
  id bigserial PK
  count integer not null
  created_at, updated_at

notifications
  id bigserial PK
  notifiable_type varchar not null     -- 'BudgetAlert' | 'PaceAlert' | 'UnclassifiedAlert' | 'InboundEmail'
  notifiable_id bigint not null
  read_at timestamp (nullable)
  created_at, updated_at
  index: (notifiable_type, notifiable_id), read_at

inbound_emails                         -- 新規
  id bigserial PK
  message_id varchar not null unique   -- 冪等性キー。onConflictDoNothingで冪等性を担保（6章参照）
  from varchar not null
  subject varchar
  raw_body text not null
  status inbound_email_status_enum('pending' | 'processed' | 'failed' | 'skipped') not null
    -- 'pending' は message_id claim 直後の初期状態。パース結果に応じて
    -- 'processed' / 'failed' / 'skipped' に update する（6章参照）
  error_message text (nullable)
  transaction_id bigint FK -> transactions.id (nullable)
  created_at
```

`notifications` は Rails 時代と同様、`notifiable_type` + `notifiable_id` によるポリモー
フィック参照を文字列カラムで表現する（Drizzle には Rails の polymorphic association 相当
の機能がないため、アプリ側で type 文字列と id を組で扱う）。

`inbound_emails` の役割は3つ。

1. `message_id` の unique 制約による冪等性保証（CloudMailin の再送・重複配信対策）
2. パース失敗時のデバッグ用に生メール本文（`raw_body`）を保存する
3. Gmail のフィルタ転送確認メールも同テーブルに生保存されるため、`raw_body` から確認コード
   を確認できる（専用実装は不要。6.7節参照）

マイグレーションは `drizzle-kit generate` で SQL を生成し、Supabase に適用する。

### 4.3 カテゴリ削除時の整合性

`apps/api/app/models/category.rb` の関連定義を確認したところ、現行 Rails の挙動は
以下の通りである。

- `has_many :children, dependent: :destroy` のみが `dependent` オプションを持ち、
  子カテゴリはカテゴリ削除時に再帰的に削除される
- `transactions` / `budgets` / `budget_alert_setting` / `pace_alert_setting` /
  `pace_alerts` / `store_category_mappings` にはいずれも `dependent` オプションが
  なく、かつ DB 側の外部キー制約（`add_foreign_key "xxx", "categories"`）にも
  `on_delete` の指定がない（デフォルトの `RESTRICT`）。そのため、これらのいずれかに
  1件でも参照が残っているカテゴリを削除しようとすると、Rails 側のチェックを素通り
  して DB の外部キー制約違反（`ActiveRecord::InvalidForeignKey`）で失敗する
- `transactions.category_id` と `budget_alert_settings.category_id` は DB上 nullable
  だが、Rails は `dependent: :nullify` を指定していないため自動で null 化されず、
  上記と同様に削除は失敗する

移行後もこの挙動（＝関連レコードが1件でも存在するカテゴリは削除できない）をそのまま
踏襲する。Drizzle には Rails の `dependent: :destroy` に相当する ORM 機能がないため、
以下のいずれかでアプリ側に実装する。

- `categories.ts` の削除 Server Action 内で、削除対象カテゴリに紐づく
  `transactions` / `budgets` / `budget_alert_settings` / `pace_alert_settings` /
  `pace_alerts` / `store_category_mappings` の存在を事前に確認し、1件でも存在すれば
  エラーを返す（Rails のFK違反を、事前チェックによるアプリレベルのバリデーション
  エラーに置き換える）
- 子カテゴリ（`parent_id` が一致するカテゴリ）については、Rails の
  `dependent: :destroy` と同様に再帰的に削除処理を行う（子カテゴリ自身も上記の
  存在チェックを満たす場合のみ）
- DB の外部キー制約自体は `RESTRICT`（`on_delete` を指定しない）のまま維持し、
  アプリ側のチェック漏れがあった場合の最終防衛線として機能させる

## 5. ビジネスロジック

Ruby実装（`apps/api/app/services/budget_pace_calculator.rb`、
`apps/api/app/services/monthly_summary_service.rb`、
`apps/api/app/jobs/budget_alert_job.rb`、`apps/api/app/jobs/pace_alert_job.rb`、
`apps/api/app/jobs/unclassified_alert_job.rb`）を読み、以下の仕様で TypeScript
（`src/lib/budget-pace.ts`、`src/lib/monthly-summary.ts`、`src/lib/alerts.ts`）に
移植する。数式・条件分岐は Ruby 実装から変更しない。

### 5.1 予算ペース計算（`budget-pace.ts` ← `budget_pace_calculator.rb`）

入力: `category`, `date`（省略時は当日）

```
GREEN_THRESHOLD  = 1.0
YELLOW_THRESHOLD = 1.2

month           = date の月初
budget          = Budget.find_by(category, month)
                  存在しなければ結果全体を null で返す（予算未設定のカテゴリはペース計算対象外）

spent           = そのカテゴリの、month の月初 〜 date の日の終わり（23:59:59）までの
                  transactions.amount 合計

days_in_month   = date が属する月の末日の日番号（例: 4月なら30）
days_elapsed    = date の日番号（例: 4月15日なら15）
remaining_days  = days_in_month - days_elapsed + 1   -- 当日を含めた残り日数

ideal_rate      = days_elapsed / days_in_month         -- 経過日数に対する「理想の消化率」
actual_rate     = spent / budget.amount                -- 実際の消化率

pace_rate       = ideal_rate が 0 なら 0.0
                  それ以外は actual_rate / ideal_rate   -- 理想消化率に対する実消化率の倍率

pace_status:
  actual_rate >= 1.0 の場合            → "RED"   -- 予算そのものを使い切っている
  上記でなく pace_rate >= 1.2 の場合    → "RED"   -- 理想ペースの1.2倍以上のオーバー
  上記でなく pace_rate >= 1.0 の場合    → "YELLOW" -- 理想ペース以上だが1.2倍未満
  それ以外                             → "GREEN"

remaining_amount = budget.amount - spent
daily_amount（日割り許容額）:
  remaining_days <= 0 の場合 → 0
  それ以外                  → remaining_amount / remaining_days
```

戻り値: `{ pace_rate, pace_status, spent, budget_amount, remaining_amount, remaining_days,
daily_amount }`

`spent` の集計クエリを Drizzle で `date` の終端まで含める点（`purchased_at` の範囲を
`month .. date.end_of_day` とする）は、当日分の取引を含めてペース判定するために必須の
挙動であり、移植時に落としてはならない。

### 5.2 月次サマリー（`monthly-summary.ts` ← `monthly_summary_service.rb`）

入力: `year`, `month`

```
period            = 指定年月の全日（月初 〜 月末）

transactions      = purchased_at が period に含まれる全取引
total_amount      = transactions.amount 合計
budget_amount     = period の月初と一致する month を持つ budgets.amount 合計
remaining_amount  = budget_amount - total_amount

pace_date:
  period が当日（Date.current）を含む場合 → 当日の日付
  含まない場合（過去月）                  → null
  ※ 過去月はペース計算が無意味なため null を返す、という Ruby実装のコメントをそのまま踏襲する

spending_by_category = transactions を category_id・category_name でグループ集計した
                        amount 合計（categories への JOIN が必要 = category_id が
                        null の取引はこのグループ化には含まれない）

category_breakdowns = spending_by_category の各カテゴリについて:
  pace = pace_date が非null かつカテゴリが存在する場合のみ
         budget-pace.ts のロジックを (category, date: pace_date) で実行した結果
         それ以外は null

  各要素:
    category_id, category_name
    amount
    percentage        = total_amount が 0 なら 0.0
                         それ以外は (amount / total_amount * 100) を小数第1位で四捨五入
    pace_status        = pace?.pace_status ?? null
    budget_amount      = pace?.budget_amount ?? null
    remaining_amount   = pace?.remaining_amount ?? null
    daily_amount       = pace?.daily_amount ?? null
```

戻り値: `{ total_amount, budget_amount, remaining_amount, category_breakdowns }`

### 5.3 予算アラート判定（`alerts.ts` ← `budget_alert_job.rb`）

現行 Rails では取引作成後に `BudgetAlertJob` を非同期（Active Job）でキューイングして
いるが、移行後は**取引 insert と同一のDBトランザクション内で同期実行**する（設計根拠は
5.5節を参照）。

```
入力: 作成された transaction

category = transaction.category
  category が null（未分類）の場合 → 何もしない

month  = transaction.purchased_at の月初
budget = Budget.find_by(category, month)
  budget が存在しない場合 → 何もしない（予算未設定のカテゴリは対象外）

alert_setting = category の budget_alert_setting
  存在しない、または is_active = false の場合 → 何もしない

spent       = そのカテゴリの month 内 transactions.amount 合計
usage_rate  = (spent / budget.amount * 100) を小数第1位で四捨五入

[alert_setting.threshold, alert_setting.threshold_2].filter(非null) の各 threshold について:
  usage_rate < threshold の場合 → この threshold はスキップ

  既に (category_id, month, threshold) の組で budget_alerts レコードが存在する場合
    → スキップ（同一閾値の重複送信を防ぐ。ここが「閾値を超えた瞬間に1回だけ」を
       担保するロジックの中核であり、DBのunique制約と組み合わせて保証する）

  存在しなければ:
    budget_alerts に (category_id, month, threshold, usage_percent: usage_rate) を insert
    notifications に (notifiable_type: 'BudgetAlert', notifiable_id: <上記id>) を insert
```

`budget_alert_settings.category_id` は DB上 nullable であり、`category_id = null`
の「カテゴリ全体向け」設定を作成すること自体は可能だが、上記判定ロジックは常に
「対象カテゴリに紐づく `budget_alert_setting`」を検索するため、`category_id = null`
のレコードは現行 Rails 実装でもそもそも判定に使われず、事実上不活性である。本移行でも
同じ仕様（カテゴリ紐付きの設定のみが判定対象）をそのまま踏襲する。なお
`pace_alert_settings.category_id` は non-null（5.4節、4.2節のテーブル定義参照）であり、
`budget_alert_settings` とは nullable 制約が非対称である点も踏襲する。

月替わりでリセットされる（翌月また送られる）のは、`month` を含めた一意制約により
別月なら新規に閾値判定されるため、追加のリセット処理は不要である。

閾値は最大2つ（`threshold`, `threshold_2`）まで設定可能で、`threshold_2` は nullable。
両方が閾値を超えていれば、それぞれ独立にアラートが作成される（例: 80%到達時と100%到達時
の両方で1回ずつ通知される）。

### 5.4 ペースアラート判定（`alerts.ts` ← `pace_alert_job.rb`）

Rails では `sidekiq-cron` により日次（あるいは定期）で全 `PaceAlertSetting` を走査する
バッチジョブだが、移行後は**取引 insert 時に、その取引が属するカテゴリの設定のみを対象に
同期実行**する（5.5節参照）。

```
入力: 作成された transaction（に紐づく category）、today = 当日日付

setting = category の pace_alert_setting
  存在しない、または is_active = false の場合 → 何もしない

setting.active_from_day > today の日番号 の場合 → 何もしない
  （例: active_from_day = 5 なら、月の1〜4日はペース判定を行わない。月初の
    データ不足による誤判定を防ぐための設定）

result = budget-pace.ts のロジックを (category, date: today) で実行
  result が null（予算未設定）の場合 → 何もしない

month      = today の月初
last_alert = (category_id, month) に一致する pace_alerts のうち、
             triggered_at が最も新しいもの

pace_rate_percent = result.pace_rate * 100   -- 小数のpace_rateを整数%相当に換算

pace_rate_percent >= setting.threshold の場合（閾値超過 = RED相当に到達）:
  last_alert が存在し、かつ recovered_at が null（＝直近のアラートがまだ「継続中」）
  の場合 → 何もしない（RED継続中は再送しない、状態遷移ベースの中核ロジック）

  それ以外（初回、または前回のアラートが既に recovered 済み）:
    pace_alerts に (category_id, month, triggered_at: 現在時刻) を insert
    notifications に (notifiable_type: 'PaceAlert', notifiable_id: <上記id>) を insert

pace_rate_percent < setting.threshold の場合（閾値未満 = 回復方向）:
  last_alert が存在し、かつ recovered_at が null の場合
    → last_alert.recovered_at を現在時刻で更新（RED から回復したことを記録）
  それ以外 → 何もしない
```

「RED → GREEN/YELLOW に回復 → また RED になったら送る」という要件は、`recovered_at` の
null/非null で現在の状態（継続中か回復済みか）を判定する状態遷移として実現されている。

### 5.5 非同期ジョブから同期実行への設計変更について

Rails 版では `BudgetAlertJob` は取引作成後に Active Job でキューイングされ、
`PaceAlertJob` と `UnclassifiedAlertJob` は `sidekiq-cron` による定期実行（バッチで
全設定を走査）だった。

移行後はこれらを Sidekiq ごと廃止し、**取引 insert 処理と同一の DB トランザクション内で
同期的に呼び出す**方式に変更する。設計根拠は以下の通り。

- 予算アラート・ペースアラートはいずれも「支出が発生した」ことをトリガーに悪化する。
  時間の経過だけでは悪化せず、日数が進むほど `ideal_rate`（理想消化率）が上がり、
  `pace_rate` はむしろ改善方向に働く
- そのため、取引が insert されるタイミングでのみ判定すれば、論理的にはバッチでの
  定期実行と同じ結果が得られる（「本来アラートすべきなのに気づかない」タイミングは
  発生しない）
- cron が不要になることで、Sidekiq/sidekiq-cron 一式を丸ごと削除できる

この同期実行方式は、取引が作成・更新・削除されうる**全ての経路**で一貫して適用する。
具体的には、6章の `/api/inbound-email` Webhook 経路（メール自動記録）と、
`transactions.ts` の Server Action による**手動での取引作成・更新・削除**経路の
両方で、5.3〜5.6節のアラート判定ロジックを、取引の insert/update/delete と
**同一の DB トランザクション内**で実行する。片方の経路だけで実行すると、手動入力分の
取引がアラート判定から漏れる、あるいはアラート判定と取引書き込みの間に不整合が生じる
（判定基準となる `spent` 集計値が確定していない状態で判定してしまう等）ため、経路ごとの
実装漏れがないことを実装フェーズ4・5で確認する。

### 5.6 未分類アラート判定（`alerts.ts` ← `unclassified_alert_job.rb`）

Rails 実装:

```
count = category_id が null の transactions の件数

count == 0 の場合:
  既存の unclassified_alerts レコードがあれば削除して終了

count > 0 の場合:
  unclassified_alerts の唯一のレコード（なければ新規作成）の count を更新
  notification が未作成であれば notifications に insert
```

`unclassified_alerts` を削除する際は、それを参照する `notifications`
（`notifiable_type: 'UnclassifiedAlert'`）の行も**同一トランザクション内**で
合わせて削除する。`notifications` はポリモーフィック参照（`notifiable_type` +
`notifiable_id`）を文字列カラムで表現しているだけで DB の外部キー制約を持たない
（4.2節参照）ため、DB側のカスケード削除（`ON DELETE CASCADE`）は効かない。この
削除漏れを防ぐため、アプリ側で明示的に対応する行を削除する処理を実装する。

移行後は、取引 insert 時（未分類のまま作成された場合）に同期実行する。ただし、
店舗マッピング編集によって既存の未分類取引が事後的に分類される、あるいは取引の
カテゴリを手動で変更するケースでは、この insert 時同期実行だけでは
`unclassified_alerts.count` が古いまま残る可能性がある。この点は7.1節のリスクとして
扱い、カテゴリ再割当てを行う Server Action（`categories.ts` の分類変更処理、
`mappings.ts` の一括再分類処理）内でも同ロジックを呼び出す。

### 5.7 丸め規則

Ruby の整数除算・`round` と JavaScript の対応する演算は挙動が異なるため、移植時に
以下の対応関係を明示しておく。

- **`daily_amount`（5.1節）**: Ruby の整数同士の除算（`remaining_amount / remaining_days`）
  は常に負の無限大方向へ切り捨てる（floor）。負値でも `-7 / 2 == -4` のようになる。
  TypeScript では `Math.floor(remaining_amount / remainingDays)` で同じ挙動になる。
  `Math.trunc`（0方向への切り捨て）は負値で結果が異なる（`Math.trunc(-3.5) === -3`）ため
  **使用してはならない**
- **`usage_rate` / `percentage`（5.1・5.2・5.3節）の小数第1位四捨五入**: Ruby の
  `round` はいわゆる round-half-up（0から遠い方向への四捨五入、例: `2.45.round(1) == 2.5`、
  `-2.45.round(1) == -2.5`）。JavaScript の `Math.round(x * 10) / 10` は正値では同じ
  round-half-up になるが、負値では `Math.round` が「+Infinity方向への四捨五入」
  （例: `Math.round(-2.5) === -2`）であるため Ruby の `round` と結果が食い違う場合がある。
  ただし本アプリで四捨五入対象となる `usage_rate` / `percentage` はいずれも金額・比率
  由来で負値を取らないため、この差異は実害がない。`Math.round(x * 10) / 10` を
  そのまま使ってよい

## 6. メールパイプライン

クレカ利用通知メールを起点に、Gmail → CloudMailin → Webhook → 取引自動記録までを
処理する。現行の「iPhoneショートカットが Gmail を読んで REST API に POST する」フロー
を完全に置き換える。

1. カード会社からの利用通知メールが Gmail に届く。Gmail のフィルタ設定により、
   CloudMailin が発行する専用アドレスへ自動転送する
2. CloudMailin が JSON 形式（Normalized JSON format）で
   `POST /api/inbound-email?token=INBOUND_TOKEN` を呼ぶ。クエリパラメータの `token` が
   環境変数 `INBOUND_TOKEN` と一致しない場合は 401 を返す。ペイロードの詳細は6.1節参照
3. `message_id`（`headers.message_id`）をキーに `inbound_emails` へ
   `status = 'pending'`（4.2節の仮ステータス）で `onConflictDoNothing` で insert し、その
   場でメッセージを「claim」する。挿入行数が0件（＝ `message_id` のunique制約違反で
   既に同一メッセージのレコードが存在した）の場合は、以降のパース・アラート判定処理を
   行わず 200 を即返す（CloudMailin の再送・重複配信に対する冪等性の担保）。事前に
   `SELECT` で存在確認してから別途 `INSERT` する二段階の実装は、確認と挿入の間に
   競合（race）が生じうるため採用せず、`message_id` の DB 一意制約違反そのものを
   冪等性のガードとして使う。挿入に成功した場合はその行の `id` を後続処理で使う
4. パーサー（`email-parser.ts`）でメール本文から金額・店舗名・利用日時を抽出する。
   対応するカード会社は三井住友カード（Vpass）の1社のみ。仕様は6.1節の通り
5. 抽出した `store_name` を `store_category_mappings` に照合し、マッチすれば
   `category_id` を確定する。マッチしない場合は `category_id` を null（未分類）のまま
   取引を作成する
6. 以下を単一のDBトランザクションで実行する。
   - `transactions` に insert（`source = 'email'`）
   - 5.3〜5.6節のアラート判定ロジックを実行し、該当すれば `budget_alerts` /
     `pace_alerts` / `unclassified_alerts` および `notifications` へ insert
   - 手順3で claim した `inbound_emails` の行を `status = 'processed'`、
     `transaction_id` に作成した取引の id を設定して update する
7. パースに失敗した場合は、手順3で claim した `inbound_emails` の行を
   `status = 'failed'` と `error_message` を設定して update した上で **200 を返す**
   （400/500系を返すと CloudMailin が再送ループに入るため、パース失敗は「受信自体は
   成功、処理は失敗」として扱う）。あわせて `notifications` に
   `notifiable_type: 'InboundEmail'` の通知を insert し、アプリ内の通知一覧から
   パース失敗をユーザーが把握できるようにする
8. Gmail のフィルタ転送設定時に届く確認メール（転送先確認コードを含むメール）も、
   通常のクレカ通知メールと同様に `/api/inbound-email` 経由で受信され、
   `inbound_emails.raw_body` にそのまま保存される。専用の確認コード抽出実装は不要で、
   `inbound_emails` テーブルを直接参照すれば確認コードを取得できる

### 6.1 email-parser.ts 仕様（三井住友カード / Vpass）

対象メールの実サンプルを2通、`docs/superpowers/specs/fixtures/` 配下に保存済みである。

- `docs/superpowers/specs/fixtures/smbc-usage-notification-sample.eml`
- `docs/superpowers/specs/fixtures/smbc-usage-notification-sample2.eml`

いずれも以下の形式を持つ。

- From: `statement@vpass.ne.jp`
- 件名: 「ご利用のお知らせ【三井住友カード】」
- `Content-Type: multipart/alternative`（`text/plain` パートと `text/html` パートを
  両方持つ）
- 文字コード: `charset=ISO-2022-JP`。`text/plain` パートは 7bit JIS でエンコードされている

**入力（CloudMailin Normalized JSON format）**

CloudMailin の JSON ペイロードは Normalized JSON format で送られてくる。`from` /
`subject` / `message_id` はペイロードのトップレベルには存在せず、`headers.from` /
`headers.subject` / `headers.message_id` に格納される。SMTP のエンベロープ送信元
（実際の配送元アドレス）は別に `envelope.from` に入る。ヘッダーの `From` と
エンベロープの送信元は異なりうる（転送メールでは特に）ため、対象メール判定（後述）
には `headers.from` を使う。

一次ソースは `plain` フィールドとする。CloudMailin は charset デコード済みの UTF-8
文字列を `plain` に格納するため、通常はこれで足りる。なお `raw` フィールド（生のメール
本文）は CloudMailin の設定でデフォルトでは送信されず、Webhook 設定で Raw format を
明示的に有効化しない限りペイロードに含まれない。本実装では Raw format を有効化しない
方針とし、`raw` に依存する代替パースは行わない（`plain` の欠落・文字化けが実際に
発生した場合は、Raw format の有効化を含めて改めて対応を検討する）。

ISO-2022-JP のデコードについては、Node.js は `TextDecoder` 単体では標準で
`iso-2022-jp` に対応していないが、full-ICU（国際化データ）を同梱した Node.js 18以降
（Node公式ビルドはデフォルトで full-ICU 同梱）であれば
`new TextDecoder('iso-2022-jp').decode(buffer)` でデコード可能である。これは
「Node標準では ISO-2022-JP をデコードできない」という誤った前提に基づくものではない。
`plain` が使えない場合のフォールバック経路が必要になった際は、この `TextDecoder` を
使う実装とし、`iconv-lite` 等の追加依存は導入しない。

**対象メール判定**

`headers.from` に `statement@vpass.ne.jp` が含まれ、かつ `headers.subject` に
「ご利用のお知らせ」を含む場合のみ処理対象とする。`headers.from` は
`三井住友カード <statement@vpass.ne.jp>` のように表示名付きの形式で届くため、
文字列の完全一致では判定できない。メールアドレス部分を抽出（`<...>` 内、または
`@` を含むトークン）した上で一致判定するか、単純に `headers.from` に
`statement@vpass.ne.jp` という文字列が含まれるか（`includes`）で判定する。
一致しない場合は取引を作成せず、`inbound_emails` に `status = 'skipped'` として
記録する（三井住友カード以外からの転送メールや、Gmail のフィルタ転送確認メール
などがここに該当する）。

**抽出対象行と正規表現**

`text/plain` パート（JISデコード後）から、以下3項目を抽出する。サンプルには
「◎ご利用日：2026/07/08 16:22」のように行頭に記号が付くが、記号自体は環境依存のため
「ご利用日」のラベル文字列で照合し、記号は正規表現に含めない。

| 項目 | 正規表現（趣旨） | 備考 |
|---|---|---|
| 利用日時 | `/ご利用日(?:時)?[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/` | ラベルは「ご利用日」「ご利用日時」の両方に対応する（`text/plain` は「ご利用日」、`text/html` パートでは「ご利用日時」表記のため）。マッチした年月日・時刻は JST として解釈し `purchased_at` に変換する |
| 店舗名 | `/ご利用先[：:]\s*(.+)/` | マッチした行の残り部分を行末までそのまま抽出し、前後の空白を trim する。全角文字（例:「セブン−イレブン」）・ASCII文字（例:「BELC WAKOSHIRAKO」）の両方に対応する |
| 利用金額 | `/ご利用金額[：:]\s*([\d,]+)\s*円/` | 「1,076 円」のようにカンマ区切り・金額と「円」の間に空白が入るケースがあるため、カンマを除去してから整数に変換する |

3項目のうち1つでも抽出できなかった場合は、取引を作成せず `inbound_emails` に
`status = 'failed'` と `error_message`（どの項目の抽出に失敗したか）を記録する。

**店舗名の正規化とマッピング照合**

抽出した店舗名は Unicode 正規化形式 NFKC で正規化した上で `store_category_mappings`
と照合する（全角ハイフン・全角英数字の表記揺れを吸収するため）。`store_category_mappings`
側も、`mappings.ts` の Server Action で保存する際に同様に NFKC 正規化してから
`store_name` を保存する方針とし、両者の正規化ルールを一致させる。

**テスト**

上記2つの fixture（全角店名「セブン−イレブン」・ASCII店名「BELC WAKOSHIRAKO」・
カンマ区切り金額・時刻付き日付をそれぞれカバーする）を `email-parser.ts` のユニット
テストの入力として使用する。

## 7. 認証

単一ユーザー・個人利用の前提を明確に割り切り、共有パスワードによる簡易認証のみを
実装する。OAuth・ユーザーテーブル・パスワードハッシュ管理などは行わない。

- `middleware.ts` で `/login` と `/api/inbound-email` を除く全ルートを保護する
- `/login` で環境変数 `AUTH_PASSWORD` と入力値を比較し、一致すれば環境変数
  `AUTH_COOKIE_SECRET` で HMAC 署名した認証 cookie を発行する
- cookie 属性: 有効期間1年、`httpOnly`、`secure`、`sameSite=lax`
- `middleware.ts` は Next.js の Edge ランタイムで実行されるため、Node.js の
  `node:crypto` モジュールは使用できない。署名の生成・検証は Web Crypto API
  （`crypto.subtle.sign` / `crypto.subtle.verify` による HMAC-SHA256）で実装する
- `/api/inbound-email` は CloudMailin からの外部呼び出しのため認証 cookie の対象外とし、
  代わりに URL クエリの `INBOUND_TOKEN` で検証する（6章参照）

## 8. 画面

既存の9ルート（動的セグメント込み）について、UI コンポーネントはそのまま流用し、
データ取得層のみを Apollo Client（GraphQL）から Drizzle 直接クエリ / Server Actions に
差し替える。

| ルート | 内容 | 差し替え方針 |
|---|---|---|
| `/` | ホーム（月次サマリー・予算・最近の取引・通知） | RSC で `monthly-summary.ts` を直接呼び出し |
| `/calendar/[year]/[month]` | カレンダー表示 | RSC で Drizzle 直接クエリ |
| `/transactions/[year]/[month]` | 支出一覧 | RSC で Drizzle 直接クエリ、更新は Server Actions |
| `/settings` | 設定トップ | RSC |
| `/settings/alerts` | 予算・ペースアラート設定 | RSC + `alert-settings.ts` の Server Actions |
| `/settings/categories` | カテゴリ管理 | RSC + `categories.ts` の Server Actions |
| `/settings/mappings` | 店舗カテゴリ・マッピング管理 | RSC + `mappings.ts` の Server Actions |
| `/settings/mail` | メール通知設定 | **廃止**（メール送信機能の廃止に伴い削除） |
| `/login` | 認証 | 新規追加 |

クライアント側の操作（フォーム送信・トグル操作など）は、これまで GraphQL Mutation
経由だったものを Server Actions の呼び出しに置き換える。バリデーションは zod を使う。
更新後は該当パスに対して `revalidatePath` を呼び、RSC の再取得を促す。

### 8.1 通知一覧UI（`notification-list.tsx`）の改修

現行実装（`apps/web/src/components/notification-list.tsx`）は `notifiable.__typename`
を見て `"BudgetAlert"` と `"PaceAlert"` のみを明示的に分岐し、それ以外は全て
`UnclassifiedAlert` 用の表示にフォールスルーする実装になっている（`NotificationRow`
内の if 分岐の末尾コメント `// UnclassifiedAlert` 参照）。移行後は `notifiable_type`
に `'InboundEmail'`（6章のパース失敗通知）が新たに加わるため、このフォールスルーの
ままだと InboundEmail 通知が誤って UnclassifiedAlert の表示（アイコン・文言）になって
しまう。`'InboundEmail'` 用の分岐を明示的に追加し、デフォルト分岐は
`'UnclassifiedAlert'` の場合のみに限定する（あるいは網羅性を保証するため、最後の
分岐も `notifiable_type === 'UnclassifiedAlert'` の明示チェックにし、想定外の
`notifiable_type` は開発時にエラーで気づけるようにする）。

RSC 側の通知ローダは、GraphQL の Union 型解決に相当する処理をアプリ側で組み立てる
必要がある。設計は以下の通り。

1. `notifications` テーブルを取得し、`notifiable_type` ごとにレコードをグルーピングする
2. `notifiable_type` の値（`'BudgetAlert'` / `'PaceAlert'` / `'UnclassifiedAlert'` /
   `'InboundEmail'`）ごとに、対応するテーブル（`budget_alerts` / `pace_alerts` /
   `unclassified_alerts` / `inbound_emails`）へ `notifiable_id` の `IN` 句で2次
   クエリを発行する
3. 2次クエリの結果を `notifiable_id` をキーに `notifications` の各行へマージし、
   `{ id, notifiable: { __typename: notifiable_type, ...対応テーブルのカラム } }`
   という、`notification-list.tsx` が期待する union 型相当のオブジェクト配列を
   組み立てて渡す

## 9. テスト方針

Vitest を使用する。

- **純粋ロジックのユニットテスト**: `email-parser.ts`、`budget-pace.ts`、`alerts.ts`、
  `monthly-summary.ts` を対象にする。既存の RSpec テストケース（5章で挙げた各ジョブ・
  サービスの spec）にある閾値境界値・状態遷移のテストケースを TypeScript に翻訳して
  移植する。例えば `pace_status` の `pace_rate = 1.0` ちょうど（YELLOW境界）、
  `pace_rate = 1.2` ちょうど（RED境界）、`actual_rate >= 1.0`（予算超過による強制RED）
  などの境界値テストを引き継ぐ
- **DB を伴うテスト（integration test）**: Server Actions、Webhook（`/api/inbound-email`
  の一連の処理）を対象にする。外部の実DBを使わず `@electric-sql/pglite` +
  Drizzle でインメモリ相当の PostgreSQL 互換DBを都度構築し、高速に実行する
- **E2E テストは対象外**とする。個人利用アプリであり、デプロイ前の手動確認で十分と判断する

## 10. データ移行

`scripts/migrate-settings.ts` を1回きりのスクリプトとして実装し、ローカルで動作している
Rails 用 PostgreSQL から Supabase へ、設定系データのみを移行する。

移行対象:

- `categories`（`type` 文字列 → `kind` enum への変換を行う）
- `budgets`
- `store_category_mappings`
- `budget_alert_settings`
- `pace_alert_settings`

移行しないもの: 取引履歴（`transactions`）、通知（`notifications`）、アラート履歴
（`budget_alerts` / `pace_alerts`）、未分類アラート（`unclassified_alerts`）。これらは
移行先で空の状態から運用を開始する。

移行時は ID の再採番が発生するため、`categories.parent_id` の自己参照や、
`budgets.category_id` などの外部キー参照については、旧ID→新IDのマッピングを
スクリプト内で保持し、参照整合性を維持した上で insert する。

## 11. 環境変数

| 変数名 | 用途 |
|---|---|
| `DATABASE_URL` | Supabase の connection pooler（transaction-mode、port 6543）経由の接続文字列。アプリ実行時に使用し、`prepare: false` を指定して接続する（3章参照） |
| `DIRECT_URL` | Supabase への直接接続文字列（port 5432）。`drizzle-kit generate` / `drizzle-kit migrate` などDDL実行時のみ使用する（3章参照） |
| `AUTH_PASSWORD` | ログイン画面で照合する共有パスワード |
| `AUTH_COOKIE_SECRET` | 認証 cookie の HMAC 署名鍵 |
| `INBOUND_TOKEN` | CloudMailin Webhook のURLトークン検証用 |

## 12. 実装フェーズ

1. **基盤構築**: Drizzle 導入、`schema.ts` 作成、Supabase 接続設定、pglite によるテスト
   基盤の整備
2. **設定系データ移行**: `scripts/migrate-settings.ts` の実装と実行
3. **純粋ロジック移植**: `budget-pace.ts`、`monthly-summary.ts`、`alerts.ts`、
   `email-parser.ts` の実装とユニットテスト（`email-parser.ts` は6.1節の fixture を
   用いて実装する）
4. **Server Actions + 画面差し替え**: ホーム → 取引一覧 → カレンダー → 設定各画面の順で
   データ層を Drizzle / Server Actions に差し替える
5. **メール Webhook**: `inbound_emails` テーブルと `/api/inbound-email` Route Handler
   の実装
6. **認証**: `middleware.ts` と `/login` の実装
7. **掃除**: GraphQL・Apollo・codegen・`src/gql`・`apps/api` の削除、
   `/settings/mail` の削除、`CLAUDE.md` の全面更新
8. **デプロイ**: Vercel + Supabase の本番設定、CloudMailin セットアップ、Gmail 転送
   設定、一連の動作確認

各フェーズはこの順に着手する想定だが、3と4は並行して進めても依存関係上は問題ない
（4は3の関数をServer Actionsやページから呼び出す形で利用するため、3が一部未完成でも
先にUIの配線自体は進められる）。ただし5（メールWebhook）は3の `alerts.ts` /
`email-parser.ts` に依存するため、3の完了後に着手する。

## 13. リスク・未決事項

- **CloudMailin の無料枠が変更されるリスク**: 無料枠の1万通/月という条件が将来的に
  変更・撤廃される可能性がある。代替案として Gmail API + Pub/Sub push 通知を用いた
  実装に切り替えることが可能で、その場合も影響範囲は `/api/inbound-email` の
  Route Handler の差し替えのみに収まるよう設計している（パーサー・アラート判定・DB
  スキーマ側には手を入れない）
- **DB を Neon でなく Supabase にした経緯**: Neon の無料枠（100 CU-hrs/月）は、
  ユーザーの別の既存プロジェクトが既に消費している状態のため、本プロジェクトを
  独立させる目的で Supabase を採用した
- **未分類アラートの再計算漏れ**: `unclassified_alerts` は取引 insert 時の同期実行の
  みでは、店舗マッピング編集による事後的な再分類やカテゴリの手動変更を反映できない
  （5.6節）。カテゴリ変更系の Server Action 内でも同ロジックの呼び出しが必要であり、
  実装フェーズ4で対応漏れがないか確認する
