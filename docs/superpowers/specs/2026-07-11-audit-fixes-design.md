# 監査検出3件の修正 設計書

日付: 2026-07-11
ステータス: 承認済み（「まとめて直す。予算設定済みなら表示する」）

同日実施のバグ残存監査（コントラスト / ドライバ型 / ガード起因データ落ち）で検出した3件を修正する。

## 1. 予算設定済み・支出ゼロのカテゴリカードが消える（実バグ）

**原因**: `getMonthlySummary`（`src/lib/monthly-summary.ts`）の `categoryBreakdowns` は
`transactions INNER JOIN categories` の集計（`parentAggs`）からのみ生成されるため、対象月に
取引が無いカテゴリは予算設定済みでも breakdown 自体が生成されない。月初はほぼ全カテゴリの
カードが消え、SummaryCard の合計予算とカード群の予算合計も食い違う。

**修正**: `parentAggs` 構築後、`effectiveBudgets` のキーのうち `parentAggs` に無い categoryId を
`categories` から name を引いて `amount: 0, children: []` の agg として追加する。
以降の既存ロジックがそのまま適用され、
- 当月: 実績 ¥0 / 予算、バー0%、ペースバッジ（GREEN）、残り=予算・1日あたり付き
- 過去月: 実績 ¥0 / 予算、バー0%、残り=予算（ペース系 null）

**テスト**: 予算あり・取引なしカテゴリが breakdown に含まれる（過去月: amount 0 /
budgetAmount / remainingAmount=予算 / paceStatus null。当月: paceStatus 非null）。

## 2. 過去月の支出ページでも見出しが「今月の支出」（文言）

**修正**: `SummaryCard`（`src/components/summary-card.tsx`）に `title?: string` prop を追加
（デフォルト `"今月の支出"`、TOP は無指定のまま）。
`transactions/[year]/[month]/page.tsx` は当月なら無指定、過去月なら `` `${month}月の支出` `` を渡す。

## 3. client component の当月判定が実行環境TZ（規約違反）

**原因**: `month-navigator.tsx:30` と `calendar-view.tsx:76` が生 `new Date()` で当月・今日を
判定。プロジェクト規約は日付演算 Asia/Tokyo 固定（Vercel は UTC）。JST 0:00〜8:59 に
「次月リンクの可否」「今日ハイライト」が1日ずれる。

**修正**: 両ファイルの当月・今日判定を `jstToday()` + `jstDateParts()` / `jstDayOfMonth()`
（`@/lib/dates`、純粋関数で client でも利用可）に置換。
`calendar-view` の日数・月初曜日計算（カレンダー構造、TZ 非依存）は変更しない。

## スコープ外

- BudgetList のカード並び順の変更（支出ゼロカテゴリは既存カードの後ろに付く現挙動で可）
- コンポーネント単体のUIテスト（既存方針どおり手動確認）
