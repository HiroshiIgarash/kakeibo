# 過去月の予算進捗表示 + 予算入力コントラスト修正 設計書

日付: 2026-07-11
ステータス: 承認済み

## 問題

1. **予算設定の入力欄が見えない**: `BudgetRow`（`src/components/budget-settings-content.tsx`）の
   コンテナが `bg-card`（ほぼ白）のみ指定で `text-card-foreground` 未指定。共通 `Input` は
   `bg-transparent` で文字色を継承するため、ダークテーマではページの `--foreground`（明色）を
   継承し白カード上に白文字になる。
2. **過去月の予算進捗が表示されない**: `getMonthlySummary`（`src/lib/monthly-summary.ts`）が
   `if (paceDate)` ガード内でのみ有効予算を lookup するため、過去月は全親カテゴリの
   `budgetAmount` / `remainingAmount` / `paceStatus` / `dailyAmount` が null になり、
   `BudgetList` が全カードを除外する。支出ページ（`/transactions/[year]/[month]`)は既に
   `BudgetList` を理想ペースライン100%で描画する実装があり、データ側だけが欠けている。
   過去月に予算を設定しても見えない問題も同根。

## 修正内容

### 1. BudgetRow のコントラスト修正

`budget-settings-content.tsx` の BudgetRow コンテナ（`bg-card` の div）に
`text-card-foreground` を追加する。1行の class 追加のみ。

### 2. 予算情報とペース情報の分離（`monthly-summary.ts`）

`categoryBreakdowns` の算出を次のように変更:

- **全ての月で**: `effectiveBudgets.get(categoryId)` を lookup し、予算があれば
  - `budgetAmount = budget.amount`
  - `remainingAmount = budget.amount - agg.amount`（月全体の実績に対する残額。マイナス可）
- **当月のみ**（`paceDate` が非 null のとき）: 従来どおり
  - `paceStatus`（GREEN/YELLOW/RED バッジ）
  - `dailyAmount`（残り日数での日割り額）
  - 当月の `remainingAmount` は従来どおり `calcBudgetPace` の値を使う（paceDate 時点の
    spent 基準。月全体実績と同値になるが、既存挙動を変えない）
- **過去月**: `paceStatus = null`, `dailyAmount = null`（日割りは過去月に無意味）

### 3. BudgetList のフッター条件変更（`budget-list.tsx`）

現状: `b.dailyAmount != null` のときのみ「残り ¥N · 1日あたり ¥M」を表示。

変更後: `b.remainingAmount != null` のとき表示し、
- 「残り ¥N」は常に表示（マイナスの場合もそのまま。例: 残り ¥-3,000）
- 「 · 1日あたり ¥M」は `b.dailyAmount != null`（= 当月）のときのみ連結

## 表示結果

- 当月（TOP・支出ページ）: 従来どおり（実績/予算・バッジ・プログレスバー・理想ペースライン・
  残り＋1日あたり）
- 過去月（支出ページ）: 実績/予算・プログレスバー（理想ペースライン100%）・超過時の赤%・
  「残り ¥N」。バッジと1日あたりは出ない

## テスト（TDD）

`src/lib/monthly-summary.test.ts` に過去月ケースを追加:

- 過去月 + 予算あり: `budgetAmount` / `remainingAmount`（予算−実績）が設定され、
  `paceStatus` / `dailyAmount` は null
- 過去月 + 予算あり + 実績が予算超過: `remainingAmount` がマイナス
- 当月の既存テスト: 挙動不変（回帰確認）

コントラスト修正(1)は class 追加のみのため手動確認（ダークテーマで入力値が読めること）。

## スコープ外

- 未来月の予算進捗表示（支出ページは未来月をリダイレクトで拒否する現仕様を維持）
- BudgetList のカード構成・消化率%の常時表示などの機能追加
