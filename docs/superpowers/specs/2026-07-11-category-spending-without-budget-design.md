# 予算なしカテゴリの支出表示 設計書

日付: 2026-07-11
ステータス: 承認済み

## 目的

予算を設定していないカテゴリ（過去月・趣味等）や未分類の支出額が、TOP・支出ページの
どこにも合計表示されない。「カテゴリ別予算」セクションを「カテゴリ別」に拡張し、
その月の支出の全体像（予算あり・予算なし・未分類）を1箇所で見えるようにする。

## 表示仕様（`src/components/budget-list.tsx`、TOP・支出ページ共通）

セクション見出しを「カテゴリ別予算」→「カテゴリ別」に変更し、次の順で表示する。

1. **予算ありカテゴリ**: 現行カードのまま変更なし（実績/予算・プログレスバー・
   理想ペースライン・バッジ・残り）
2. **予算なしカテゴリ**（`budgetAmount == null` かつ `amount > 0`）: 軽量な行を金額降順で
   - カテゴリ名・実績額・「予算未設定」ラベル
   - 内訳（children）があれば現行カードと同じ `details` 折りたたみ
   - プログレスバー・バッジ・残りは出さない
3. **未分類行**（`unclassifiedAmount > 0` のときのみ）: 末尾に「未分類 ¥N」。内訳・バーなし
4. 1〜3 のいずれも無い場合のみ、現行の空状態メッセージ（予算設定への誘導）を表示

これにより、セクション内の金額合計が SummaryCard の合計支出と一致する。

## データ（新クエリなし）

- `categoryBreakdowns` は予算なしカテゴリの実績を既に含む（表示側が絞っていただけ）
- `MonthlySummary`（`src/lib/monthly-summary.ts`）に `unclassifiedAmount: number` を追加:
  `totalAmount − categoryBreakdowns の amount 合計`（= カテゴリ null の取引合計と等価）
- `loadMonthlySummaryView`（`src/lib/queries.ts`）のビュー型にも `unclassifiedAmount` を追加して
  両ページへ受け渡す
- `BudgetList` の Props に `unclassifiedAmount: number` を追加。TOP（`src/app/page.tsx`）と
  支出ページ（`src/app/transactions/[year]/[month]/page.tsx`）で渡す

## テスト（TDD）

`src/lib/monthly-summary.test.ts`:
- 未分類取引あり → `unclassifiedAmount` がその合計になる
- 全て分類済み → 0
- 取引ゼロ → 0

コンポーネント表示（行の出し分け・並び）は手動確認（既存方針）。

## スコープ外

- 未分類行から分類UIへの導線（TOPのクイック分類パネルが既にその役割）
- 予算なしカテゴリへの割合バー表示
