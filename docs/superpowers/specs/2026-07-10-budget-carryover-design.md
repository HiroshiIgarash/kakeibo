# 予算の引き継ぎ（フォールバック参照）設計（2026-07-10）

## 目的
予算を毎月手動設定（または前月コピー）しなくても、一度設定した予算が変更されるまで有効であり続けるようにする。

## 方式（ブレスト案A）
データモデルは現行のまま（budgets = カテゴリ×月×金額、月初キー `YYYY-MM-01`）。
**読み取り側**を「対象月に行が無ければ、それ以前で最新の月の行を使う（有効予算）」に変更する。

- 7月に4万円を設定 → 8月以降も（明示行が無くても）4万円として扱われる
- 10月に5万円へ変更（=10月の明示行を作成）→ 10月以降は5万円
- 過去月の表示は当時の有効予算のまま（履歴が自然に保存される）
- 「予算停止」ユースケースは対象外（ユーザー確認済み: 使わない）

## 実装

### 共通ヘルパー `src/lib/effective-budget.ts`（新規）
`getEffectiveBudgets(db, monthKey): Promise<Map<number, EffectiveBudget>>`
- `EffectiveBudget = { budgetId: number; categoryId: number; amount: number; month: string }`
- クエリ: `budgets where month <= monthKey` を取得し、JS側でカテゴリ毎に最新月の行へ縮約
  （データ量はカテゴリ数×月数で極小。SQLのDISTINCT ONより単純さを優先）
- executor は `Db | DbTransaction` 互換（alerts から tx で呼べること）

### 変更箇所
1. `src/lib/monthly-summary.ts`: 予算合計・カテゴリ別予算の取得を有効予算（getEffectiveBudgets）に置換
2. `src/lib/alerts.ts`: 予算アラート判定の予算取得を有効予算に置換（対象月=取引のJST月）。
   ペース判定用の予算取得も同様（対象月=当日のJST月）
3. `src/lib/queries.ts` `loadBudgetSettingsView`: 返却行を拡張
   `{ categoryId, categoryName, budgetId, amount, inherited: { amount: number; fromMonth: string } | null }`
   - 明示行あり → budgetId/amount が入り inherited は null
   - 明示行なし・過去に設定あり → budgetId/amount null、inherited に引き継ぎ元の額と月
4. `src/components/budget-settings-content.tsx`:
   - 引き継ぎ中の行は input のプレースホルダに引き継ぎ額、行下に「YYYY年M月の設定を引き継ぎ中」表示
   - 保存 = その月の明示行を作成（既存 upsertBudget のまま）
   - 空欄保存 = その月の明示行を削除 → 引き継ぎに戻る（説明文を更新）
   - **「前月からコピー」ボタンを削除**（引き継ぎで不要になったため）
5. `src/actions/budgets.ts`: `copyBudgetsFromPreviousMonth` を削除（テストも削除）

### アラート語義の確認
- 予算アラート「閾値超過で月1回」の月キー・発火条件は不変。予算額の出どころだけ有効予算になる
- 月替わりで予算アラートがリセットされる挙動は不変（(category, month, threshold) unique のまま）

## テスト（pglite）
- effective-budget: 対象月に明示行 / 過去のみ / 設定なし / 複数カテゴリ混在 / 未来月の行は拾わない
- monthly-summary: 明示行が無い月でも前月設定の予算で budgetAmount・カテゴリ別が算出される
- alerts: 予算アラートが引き継ぎ予算で発火する（対象月に明示行なし）
- loadBudgetSettingsView: inherited の額・元月が返る / 明示行があれば inherited null

## スコープ外
- 予算停止（0円行での明示停止）
- 過去に一度も設定が無いカテゴリの扱い変更（従来どおり予算なし）
