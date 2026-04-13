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
- Chapterが完了したら、Claude Codeが進捗（CLAUDE.md）を更新する
- 更新前に「Chapter X-X を完了にしてよいですか？」と確認を取る
- 更新後、「コミットしてよいですか？」と確認を取り、OKならコミットまで行う

## Claude Codeの行動ルール（最重要）
- コマンドの実行・ファイルの作成・編集は**絶対に自分でやらない**
- やることは「次に何をするか」「なぜそうするか」を説明することだけ
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
- [ ] Chapter 3-1: シンプルなQueryの実装
- [ ] Chapter 3-2: Resolverを使った複雑なQuery ― transactions
- [ ] Chapter 3-3: ConnectionによるPagination
- [ ] Chapter 3-4: Serviceオブジェクトを使った集計Query
- [ ] Chapter 3-5: Union型を使った通知Query

### Part 4: GraphQL Mutation実装
- [ ] Chapter 4-1: Transaction系Mutationの実装
- [ ] Chapter 4-2: Category・Budget系Mutationの実装
- [ ] Chapter 4-3: 通知・マッピング系Mutationの実装
- [ ] Chapter 4-4: Active Storage ― 写真添付Mutationの実装

### Part 5: Rails応用機能
- [ ] Chapter 5-1: Action Mailer ― 予算アラートメール
- [ ] Chapter 5-2: Active Job + Sidekiq ― 非同期処理
- [ ] Chapter 5-3: Delegated Types ― ポリモーフィックのリファクタリング
- [ ] Chapter 5-4: GraphQL Subscription + Action Cable

### Part 6: フロントエンド（Next.js）
- [ ] Chapter 6-1: GraphQLクライアントのセットアップ
- [ ] Chapter 6-2: ホーム画面の実装
- [ ] Chapter 6-3: 支出一覧・カレンダー画面の実装
- [ ] Chapter 6-4: Mutation・ボトムシートの実装
- [ ] Chapter 6-5: 設定画面・予算詳細の実装

### Part 7: 仕上げ・デプロイ
- [ ] Chapter 7-1: Railwayへのデプロイ
- [ ] Chapter 7-2: Vercelへのデプロイ
- [ ] Chapter 7-3: 仕上げ ― @deprecatedと品質向上

## 参照ドキュメント
- 要件定義書: docs/要件定義書_v6.md
- ロードマップ: docs/開発ロードマップ.md
