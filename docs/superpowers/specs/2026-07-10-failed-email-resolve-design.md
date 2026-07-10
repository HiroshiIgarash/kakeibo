# 取り込み失敗メールの手動登録（ホームTOP）設計（2026-07-10）

## 目的
パースに失敗した受信メール（例: 外貨建て表記 `990.00 JPY`）をホームで提示し、
ユーザーが実際の引落額（円）を入力してその場で取引登録できるようにする。
想定フロー: 三井住友アプリで実額を確認 → 本アプリで金額入力 → 登録（ユーザー承認済み）。

## 挙動
- ホームに「取り込みに失敗したメール」カードを表示（`inbound_emails.status='failed'` が0件なら非表示）
- 各行: 店名（本文から抽出できた場合）/ 利用日 / 元の金額表記（例: `990.00 JPY`）/ エラー内容
- 行タップ → 展開フォーム: 金額（円、空欄・必須）/ 店名（抽出値プリフィル・編集可）/ 日付（同）
  - **登録** → 1トランザクションで: 取引作成（source='email'、マッピング一致すれば自動分類=Webhookと同じ規則）
    + `inbound_emails` を processed 化・取引に紐付け + アラート判定同期実行 + 未分類refresh
    + 該当の InboundEmail 通知を削除。成功で `router.refresh()`
  - **無視** → status を 'skipped' に変更 + InboundEmail 通知削除（行データは残す・削除しない）
- カテゴリはここでは選ばない（登録後は未分類 → クイック分類セクションで分類する合成設計）

## ホームの表示順変更（ユーザー指定）
通知 → 今月の支出（SummaryCard）→ 未分類の取引 → 取り込みに失敗したメール → 予算リスト → 最近の取引

## 実装

### 部分抽出ヘルパー（`src/lib/email-parser.ts` に追加の純関数・既存インターフェース変更なし）
`extractSmbcFields(plain: string): { storeName?: string; date?: string; amountRaw?: string }`
- 利用先 → storeName（NFKC+trim、既存パーサーと同じ正規化）
- 利用日 → `YYYY-MM-DD`（`YYYY/MM/DD` 部分のみ。時刻は使わない）
- 利用金額 → 行の生文字列（例: `990.00 JPY`。ヒント表示用、数値化しない）
- どのフィールドも見つからなければ undefined

### 新loader（`src/lib/queries.ts`）
`loadFailedInboundEmails(db): Promise<FailedInboundEmailView[]>`
- `status='failed'` を `created_at` 降順で取得
- 返却行: `{ id: string, subject: string, errorMessage: string | null, receivedAt: string(JST YYYY-MM-DD), storeName?: string, date?: string, amountRaw?: string }`（後半3つは rawBody から extractSmbcFields）

### 新action（`src/actions/inbound-emails.ts`）
- `resolveFailedInboundEmail({ id, amount, storeName, date }): Promise<ActionResult>`
  - zod: amount int正, storeName min1, date `YYYY-MM-DD`
  - db.transaction: 対象行が `status='failed'` かつ `transaction_id IS NULL` でなければエラー（二重登録防止）。
    マッピング照合（normalizeStoreName、Webhookと同一規則）→ 取引insert（purchasedAt=jstDateInputToDate(date)）
    → evaluateAlertsForTransaction → refreshUnclassifiedAlert → inbound_emails 更新（processed + transaction_id）
    → notifications から (InboundEmail, id) を削除
  - `revalidatePath("/")`
- `ignoreFailedInboundEmail({ id }): Promise<ActionResult>`
  - 対象行が failed でなければエラー。status='skipped' に更新 + InboundEmail 通知削除。`revalidatePath("/")`

### UI
- `src/components/failed-email-resolve.tsx`（新規、"use client"）: 上記挙動。既存カードUIの作法に合わせる
- `src/app/page.tsx`: loader追加 + 表示順を指定どおりに並べ替え

## テスト（pglite + ユニット。UIは対象外）
- extractSmbcFields: 全フィールド抽出 / 金額だけ外貨表記 / 何も無い本文
- loader: failedのみ返す / 抽出プリフィル / 降順
- resolve: 取引作成+紐付け+processed化+通知削除+マッピング自動分類 / 二重resolve拒否 / バリデーション
- ignore: skipped化+通知削除 / failed以外は拒否

## スコープ外
- 外貨レート自動換算
- 失敗メールの完全削除
