# かけいぼ プロジェクト

## 概要
個人用家計簿アプリ。iPhoneショートカットでクレカ利用を即日記録する。
食費の予算オーバーを防ぐことがコアの目的。
Rails（API） + Next.js + GraphQL構成。

## 開発ルール
- TDDで進める（テストを先に書いてRedを確認 → 実装 → Green）
  - **必ずFactory → spec → 実装の順番を守る。実装を先に書いてはいけない**
- コマンドは1つずつ提示して、私が実行してから次に進む
- コードを見せる前に必ず概念の説明を入れる
- Rails・GraphQL学習中なので、なぜそのコマンド・コードを書くかを都度説明する
- 各Chapterの冒頭で🎯目的・📚学ぶこと・🔑概念解説を示してから実装に入る
- 各Chapterの末尾に✅まとめを示す（📌やったこと・🔑学んだ概念・🔗前後のつながり）

## 進捗管理ルール
- Chapterが完了したら、✅まとめを出力する
- まとめを出力したら「コードレビューを行いますか？」と確認を取る
  - 行う場合は `/everything-claude-code:code-review` スキルを実行する
  - レビュー結果に対応が必要な指摘があれば対処してから次へ進む
- コードレビュー完了後（またはスキップ後）、「Chapter X-X を完了にしてよいですか？」と確認を取る
- 確認が取れたらCLAUDE.mdを更新する
- 更新後、「コミットしてよいですか？」と確認を取り、OKならコミットまで行う

## Claude Codeの行動ルール（最重要）
- 基本的に、コマンドの実行・ファイルの作成・編集は**自分でやらない**
- やることは「次に何をするか」「なぜそうするか」を説明することだけ
- ただし、ユーザーから明示的に「やって」「実行して」と頼まれた場合はコマンドを実行してよい
- 1つ説明したら必ず止まって、ユーザーが「やった」「完了」と言うまで次に進まない
- 進め方の例：
  - Claude：「次は○○というファイルを作ります。理由は〜〜。以下のコマンドを入力してください：`<コマンド>`」
  - ユーザー：「やった」
  - Claude：「確認できました。次は〜〜」

## 技術スタック
- Backend: Ruby on Rails最新版（APIモード）+ graphql-ruby
- Frontend: Next.js（App Router）
- DB: PostgreSQL
- Test: RSpec + FactoryBot + Shoulda Matchers
- Enum管理: enumrize gem
- 非同期: Active Job + Sidekiq
- ファイル管理: Active Storage
- メール: Action Mailer
- インフラ: Railway（Rails + PostgreSQL + Sidekiq）+ Vercel（Next.js）

## ディレクトリ構成
- apps/api/        → Rails
- apps/web/        → Next.js
- docs/            → 要件定義書・ロードマップ

## 現在の進捗
### Part 0: 環境構築・設計
- [x] Chapter 0-1: プロジェクトのセットアップ
- [x] Chapter 0-2: Gitの初期設定とGitHub連携
- [x] Chapter 0-3: Claude Codeの設定（MCP・Skills）

### Part 1: Railsの基礎（モデル・REST API）
- [x] Chapter 1-1: データベース設計とマイグレーション
- [x] Chapter 1-2: Categoryモデル ― STIと階層構造
- [x] Chapter 1-3: Transactionモデル ― enumrize・Scope・カスタムバリデータ
- [x] Chapter 1-4: その他モデルの実装
- [x] Chapter 1-5: 通知モデル ― ポリモーフィック関連
- [x] Chapter 1-6: ショートカット連携API（REST）

### Part 2: GraphQL基盤
- [x] Chapter 2-1: graphql-rubyのセットアップとSchema設計
- [x] Chapter 2-2: InterfaceとBaseクラスの設計
- [x] Chapter 2-3: EnumとCustom Scalarの実装
- [x] Chapter 2-4: TypeクラスとInput Objectの実装
- [x] Chapter 2-5: Dataloaderの実装 ― N+1問題を解決する

### Part 3: GraphQL Query実装
- [x] Chapter 3-1: シンプルなQueryの実装
- [x] Chapter 3-2: Resolverを使った複雑なQuery ― transactions
- [x] Chapter 3-3: ConnectionによるPagination
- [x] Chapter 3-4: Serviceオブジェクトを使った集計Query
- [x] Chapter 3-5: Union型を使った通知Query

### Part 4: GraphQL Mutation実装
- [x] Chapter 4-1: Transaction系Mutationの実装
- [x] Chapter 4-2: Category・Budget系Mutationの実装
- [x] Chapter 4-3: 通知・マッピング系Mutationの実装
- [x] Chapter 4-4: Active Storage ― 写真添付Mutationの実装

### Part 5: Rails応用機能
- [x] Chapter 5-1: Action Mailer ― 予算アラートメール
- [x] Chapter 5-2: Active Job + Sidekiq ― 非同期処理
- [~] Chapter 5-3: Delegated Types ― ポリモーフィックのリファクタリング（スキップ：現設計で十分なため）
- [x] Chapter 5-4: GraphQL Subscription + Action Cable

### Part 6: フロントエンド（Next.js）
- [x] Chapter 6-1: GraphQLクライアントのセットアップ
- [x] Chapter 6-2: ホーム画面の実装
- [x] Chapter 6-3: 支出一覧・カレンダー画面の実装
- [x] Chapter 6-4: Mutation・ボトムシートの実装
- [x] Chapter 6-5: 予算詳細画面の実装
- [x] Chapter 6-6: アラート設定画面の実装
- [x] Chapter 6-7: カテゴリ・マッピング管理画面の実装
- [x] Chapter 6-8: DailyAllowance Query ― BudgetPaceCalculatorをGraphQLに繋ぐ
- [x] Chapter 6-9: 月次サマリーメール ― Cron + Action Mailer
- [ ] Chapter 6-10: メール通知設定画面 ― 設定の可視化

### Part 7: 仕上げ・デプロイ
- [ ] Chapter 7-1: credentials移行 ― ENV から Rails credentials へ
- [ ] Chapter 7-2: Railwayへのデプロイ
- [ ] Chapter 7-3: Vercelへのデプロイ
- [ ] Chapter 7-4: 仕上げ ― @deprecatedと品質向上

## メールアラート仕様（Chapter 5-2 実装予定）

### 予算アラートメール
- カテゴリごとに閾値を**2つまで**設定可能（例: 80% と 100%）
- 各閾値を**超えた瞬間に1回だけ**送信
- 月が変わったらリセット（翌月はまた送る）

### ペースアラートメール
- 日割りペース（理想消費率）に対する超過率を閾値として設定可能（例: 110%）
- **送信開始日を設定可能**（例: 月の5日以降から有効 → 月初の誤送信を防ぐ）
- **状態遷移ベース**で送信（GREEN/YELLOW → RED になった瞬間のみ）
  - RED が続いている間は送らない
  - RED → GREEN/YELLOW に回復 → また RED になったら送る
- カテゴリごとにON/OFFで設定可能（固定費も設定次第で対象にできる）

### テーブル設計

**`budget_alert_settings`**（現 `alert_settings` をリネーム＋拡張）
- `category_id`, `is_active`, `threshold_1`, `threshold_2`（nullable）

**`pace_alert_settings`**（新規）
- `category_id`, `is_active`, `threshold`（例: 110）, `active_from_day`（例: 5）

**`budget_alerts`**（既存、カラム追加）
- `month` カラム追加、`(category_id, month, threshold)` にユニーク制約
- 重複防止 + アプリ内通知のnotifiableを兼ねる

**`pace_alerts`**（新規）
- `category_id`, `month`, `triggered_at`, `recovered_at`（null = まだRED）
- アプリ内通知のnotifiableを兼ねる

## 参照ドキュメント
- 要件定義書: docs/要件定義書_v6.md
- ロードマップ: docs/開発ロードマップ.md
