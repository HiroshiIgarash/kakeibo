# カテゴリ2階層化 設計（2026-07-10）

## 目的
カテゴリを「親 > 子」の2階層にする（例: 食費 > お菓子、食費 > 外出、趣味 > VTuber）。
取引には**子カテゴリのみ**を割り当てる。予算・アラートは**親カテゴリ単位**で管理し、
コア目的「食費の予算オーバー防止」を親レベルの集計で実現する。

## データルール（ユーザー承認済み）
- 親カテゴリ: `parentId = null`。`kind`（fixed/variable）と `color` は親が保持
- 子カテゴリ: `parentId` 必須（親のidを指す）。名前と並び順のみ持つ。表示上の色・kindは親から継承
- 階層は2段まで（子の下に子は作れない = 孫禁止）
- 取引（`transactions.categoryId`）・店舗マッピング（`storeCategoryMappings.categoryId`）:
  **子のみ**割当可。親IDが来たら Server Action / 事後分類でエラー
- 予算（`budgets`）・予算アラート設定・ペースアラート設定・各アラート: **親のみ**
- 未分類（`categoryId = null`）は現状どおり許容
- 細分化不要なカテゴリも必ず子を1つ作る（2階層強制。例: 日用品 > 一般）

## スキーマ
`categories.parentId`（自己参照FK・index付き）が既存のため **DDL変更なし**。
階層制約（子のみ割当・親のみ予算・孫禁止）はアプリ層バリデーション + pglite テストで担保する
（FK先の行属性に依存する制約はSQLの通常FK/CHECKで表現できないため。単一ユーザー・
全書込がServer Action/Webhook経由という前提でアプリ層検証を採用）。

## 既存データのリセット（ユーザー承認済み）
既存カテゴリは削除し、紐づく取引はすべて未分類に戻す。1回きりスクリプト
`apps/web/scripts/reset-categories.ts` を作成し、単一トランザクションで以下を実行:

1. `UPDATE transactions SET category_id = NULL`
2. `DELETE FROM store_category_mappings`
3. budget_alerts / pace_alerts を参照する notifications を削除
4. `DELETE FROM budget_alerts` / `DELETE FROM pace_alerts`
5. `DELETE FROM budget_alert_settings` / `DELETE FROM pace_alert_settings`（全体設定
   `categoryId = null` の行も含め全削除。新体系で設定し直す）
6. `DELETE FROM budgets`
7. `DELETE FROM categories`
8. 未分類アラート（unclassified_alerts）を最新件数で更新

実行は本番 `DATABASE_URL` に対して手動1回（migrate-settings.ts と同じ運用）。

## 変更点

### 新規 `src/lib/category-tree.ts`（純粋ロジック + DBヘルパー）
- `type CategoryNode = { id, name, kind, color, sortOrder, children: {id, name, sortOrder}[] }`
- `buildCategoryTree(rows)`: フラット行 → 親ソート順・子ソート順のツリー（純粋関数）
- `getCategoryRole(db, id)`: `"parent" | "child" | null`（存在しない）を返す
  - Server Action / 事後分類から呼び、割当先の検証に使う

### `src/lib/queries.ts`
- `loadCategories(db)`: `parentId` を含めて返し、ツリー構築に使えるようにする
- `loadCategoryOptions(db)`: **子のみ** + 親名・親色を同梱
  `{ id, name, parentId, parentName, color(=親のcolor) }`。取引フォーム・マッピング・
  クイック分類の選択肢（親名でグルーピング表示）
- 新規 `loadParentCategoryOptions(db)`: **親のみ** `{ id, name, color }`。
  予算設定・アラート設定用
- `selectTransactions()`: categories を親に self join し、取引行に
  `category: { id, name(子), parentId, parentName, color(親) }` を返す
- カテゴリフィルター: 親ID指定 → その親の全子カテゴリの取引、子ID指定 → 単一カテゴリ

### `src/actions/categories.ts`
- `createCategory`: `parentId`（任意）を受け付ける
  - `parentId` なし → 親を作成（name / kind / color 必須）
  - `parentId` あり → 子を作成（name のみ。親が存在し、かつ親自身が子でないこと = 孫禁止を検証）
- `updateCategory`: 親は name / color、子は name のみ
- `deleteCategory`: 親は「子が1つでも残っていれば拒否」を追加。子は既存の参照チェック
  （取引・予算・マッピング等）を維持

### `src/actions/transactions.ts` / `src/actions/mappings.ts`
- `categoryId` が指定されたら `getCategoryRole` で **child** であることを検証。
  親IDなら zod エラーと同形式のフィールドエラーを返す
- `upsertStoreMapping` の事後分類・再分類ロジックは無変更（マッピング自体が子に限定されるため）

### `src/actions/budgets.ts` / `src/actions/alert-settings.ts`
- `categoryId` が **parent** であることを検証（budgetAlertSettings の全体設定
  `categoryId = null` は現状どおり許容）

### `src/lib/alerts.ts`
- `evaluateAlertsForTransaction`: 取引の子 `categoryId` → `parentId` を解決し、
  **親IDで**予算アラート・ペースアラートを判定。判定ロジック本体
  （evaluateBudgetAlert / evaluatePaceAlert）は引数が親IDになるだけで無変更

### `src/lib/monthly-summary.ts`
- カテゴリ別集計を**親単位**に変更: categories(子) を親に解決して group by 親
- `CategoryBreakdown` に `children: { categoryId, categoryName, amount }[]` を追加
  （親内の子内訳。金額降順）
- ペース計算・予算対応は親単位（effective-budget は親キーのまま無変更）

### Webhook `src/app/api/inbound-email/route.ts`
- 無変更（マッピング経由の categoryId は常に子。マッピング登録時に検証済み）

### UI
- `category-management-content.tsx`: 親の下に子をネスト表示。親追加（name/kind/color）、
  親ごとに「＋子を追加」（name のみ）、それぞれ編集・削除。子が残る親の削除はエラー表示
- `transaction-form-sheet.tsx` / `mapping-management-content.tsx` /
  `unclassified-quick-classify.tsx`: カテゴリ選択を「親名でグルーピングした子の一覧」に変更
  （select の optgroup 相当）。クイック分類の「＋新しいカテゴリ」は親選択 + 子名入力に変更
- `budget-settings-content.tsx` / `alert-settings-content.tsx`: 親カテゴリのみ列挙（loadParentCategoryOptions）
- ホーム月次サマリー: 親行（予算対比・ペース表示は現行のまま）をタップで子内訳を展開表示
- `category-filter-chips.tsx`: 親チップを表示 → 親選択中はその子チップを追加表示して絞り込み

## テスト（TDD・pglite）
- category-tree: buildCategoryTree の並び・ネスト（ユニット）
- categories action: 親作成 / 子作成 / 孫禁止 / 子ありの親削除拒否
- transactions / mappings action: 親ID割当の拒否、子ID割当の成功
- budgets / alert-settings action: 子ID設定の拒否、親ID設定の成功
- alerts: 子カテゴリ取引 → 親の予算・ペースアラートが発火（webhook統合含む）
- monthly-summary: 親単位集計 + 子内訳、親の有効予算との対応
- queries: loadCategoryOptions（子のみ・親情報同梱）、loadParentCategoryOptions（親のみ）、
  親IDフィルターで子取引が取れること
- reset-categories はスクリプトのため自動テスト対象外（実行前に dry-run で件数表示）

## スコープ外
- 3階層以上のネスト
- 子カテゴリ単位の予算・アラート
- 既存カテゴリ・取引分類の自動移行（手動で作り直し）
