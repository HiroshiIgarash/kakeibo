# 予算設定画面 設計（2026-07-10）

## 目的
月次予算（budgets: カテゴリ×月×金額）を編集するUIが存在しない問題を解消する。
`/settings/budgets` を追加し、既存の `upsertBudget` / `deleteBudget` Server Action を活用する。

## 決定事項（ブレスト結果）
- 月ナビ付き + 「前月からコピー」ボタン（案C）
- 対象は全カテゴリ（固定費・変動費とも。案A）
- 編集UXは行ごとインライン保存（案1、アラート設定画面と同型）

## 画面
- URL: `/settings/budgets?month=YYYY-MM`（省略時は当月。JSTは `jstDateParts(jstToday())`）
- 設定トップ（`/settings`）の一覧に「予算」項目を追加（アイコン: lucide `Wallet`）
- 構成: 戻るリンク / 月ナビ（← YYYY年M月 →、`Link` で `?month=` 遷移）/ 前月からコピー ボタン /
  カテゴリ行のリスト（カテゴリ名・金額input・保存ボタン・行内エラー表示）
- 空欄で保存 = その月のそのカテゴリの予算を削除（未設定なら no-op）

## 実装

### 新loader（`src/lib/queries.ts`）
`loadBudgetSettingsView(db, monthKey): Promise<BudgetSettingRow[]>`
- 全カテゴリ（`sortOrder` 順）に対象月の budgets を left join
- 返却行: `{ categoryId: string, categoryName: string, budgetId: string | null, amount: number | null }`
- id は既存規約どおり `String()` でシリアライズ

### 新action（`src/actions/budgets.ts` に追加）
`copyBudgetsFromPreviousMonth(input: { month: string }): Promise<ActionResult & { copied?: number }>`
- month を zod で検証（下記の強化regex + monthKey 正規化、既存 upsertBudget と同一方式）
- 前月 = monthKey の1ヶ月前（`jstMonthRange` 等は不要、year/month 演算で算出）
- `db.transaction` 内で: 前月の全 budgets を読み、**対象月に同カテゴリの予算が無いものだけ** insert
- 戻り値に `copied`（コピー件数）。前月ゼロ件なら `copied: 0`（エラーにしない）
- `revalidatePath("/")` + `revalidatePath("/settings/budgets")`

### 既存action修正（繰延指摘の解消）
- `upsertBudget` の month regex を `/^\d{4}-\d{2}-\d{2}$/` → `/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/` に強化
  （13月等の不正月を入口で拒否。`copyBudgetsFromPreviousMonth` も同じ regex を使う）

### ページ・コンポーネント
- `src/app/settings/budgets/page.tsx`: RSC、`export const dynamic = "force-dynamic"`、
  searchParams から month を解決（不正値は当月へフォールバック）、loader を呼び client へ props 渡し。
  前月・翌月の `?month=` リンク文字列も RSC 側で計算して渡す
- `src/components/budget-settings-content.tsx`: `"use client"`。行ごとの金額 state、
  保存 = 値あり→`upsertBudget` / 空→（budgetId あれば）`deleteBudget`、
  コピー = `copyBudgetsFromPreviousMonth` → 成功で `router.refresh()`。
  エラーは行内（または画面上部）に `errors` を表示。既存 `alert-settings-content.tsx` の作法に合わせる
- `src/app/settings/page.tsx`: SETTINGS_SECTIONS に予算項目を追加

## テスト（pglite統合。UIコンポーネントは既存方針どおりテスト対象外）
- loader: 全カテゴリが並ぶ（予算未設定は amount null）/ 対象月のみ join される / sortOrder 順
- copy: 前月→対象月へコピーされる / 対象月に既存の行は上書きされない / 前月ゼロ件で copied=0
- upsertBudget: `2026-13-01` が拒否される（強化regexのRED→GREEN）

## エラー・セキュリティ
- 入力検証は zod（既存規約）。認証は proxy.ts が全ルートをゲート済みで追加対応不要
- action の返却は既存 `{ errors: string[] }` 規約に従う

## スコープ外
- 予算の一括編集フォーム、モーダル編集
- サブカテゴリ階層の考慮（現状UIでは階層を作れないためフラット表示）
- ホーム画面側の変更（既存の予算リスト表示はそのまま）
