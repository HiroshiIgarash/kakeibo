# 予算一括調整ウィザード 設計書

日付: 2026-07-11
ステータス: 承認済み

## 目的

月のカテゴリ予算を「全体の予算額」と「先月の実績」を見ながら一括で決められるようにする。
現状の予算設定画面は行単位の個別編集のみで、全体感（合計いくらか・あといくら配分できるか）を
見ながらの調整ができない。

## 決定事項（ブレスト確定）

- **全体予算額は配分ガイドのみ**。保存しない。確定後の全体予算 = カテゴリ予算の合計（現行どおり）。DB 変更なし
- **対象月 = 予算設定画面で表示中の月**（月ナビの月を引き継ぐ）
- **配分合計と全体額の不一致は警告のみ**。保存はできる

## 画面フロー

### エントリ

`/settings/budgets`（予算設定画面）に「予算をまとめて調整」ボタンを追加。
表示中の月を引き継いで `/settings/budgets/plan?month=YYYY-MM-01` へ遷移する。
month クエリが不正・欠落時は当月として扱う。

### ステップ① 全体額の決定

参考情報として表示:
- 先月の支出合計（`getMonthlySummary(prevYear, prevMonth).totalAmount`）
- 先月の予算合計（先月の有効予算合計）
- 対象月の現予算合計（対象月の有効予算合計）

全体額 input（number）:
- 初期値 = 対象月の現有効予算合計。それが 0 なら先月の支出合計
- 「次へ」でステップ②へ（クライアント内の step 状態遷移。ページ遷移しない）

### ステップ② カテゴリ配分

- 親カテゴリごとに1行: カテゴリ名 / 先月の実績（親+子合算、`getMonthlySummary` の先月
  breakdown から） / 予算 input
- input 初期値 = 対象月の有効予算額（明示・引き継ぎとも同額でプリフィル。引き継ぎ由来かは
  区別せず、保存時は全て明示行になる）
- 上部固定サマリー: `全体 ¥N ・ 配分済み ¥M ・ 残り ¥(N−M)`
  - 残りが負なら赤字で「¥X オーバー」表示。保存は可能
- 空欄 = その月の明示設定なし。既存セマンティクスどおり、過去月の設定があれば引き継ぎが
  生きる旨を注記表示する
- 「この内容で設定」で一括保存 → 成功したら `/settings/budgets?month=...` へ戻る
- 「全体額を変更」でステップ①に戻れる（入力済みの配分は保持）

## Server Action

`src/actions/budgets.ts` に追加:

```ts
export async function saveBudgetPlan(input: {
  month: string; // 'YYYY-MM-01'
  items: { categoryId: string; amount: number | null }[];
}): Promise<ActionResult>
```

- zod 検証: month は `YYYY-MM-01` 形式、amount は null または 1 以上の整数、
  categoryId は数値文字列
- **単一 DB トランザクション**で全 items を処理:
  - `amount != null` → その月・そのカテゴリの明示行を upsert（既存 `upsertBudget` と同じ規則）
  - `amount == null` → その月の明示行があれば delete（引き継ぎ状態に戻す）
- カテゴリ存在チェック: categoryId が親カテゴリ（parentId null）であることを検証。
  違反があれば全体をロールバックしてエラー返却
- 成功時 `revalidatePath("/")` と `revalidatePath("/settings/budgets")`

## データ取得（RSC）

`/settings/budgets/plan/page.tsx`（RSC）で並列ロード:
- `loadBudgetSettingsView(db, month)` — 対象月の親カテゴリ一覧＋有効予算（既存）
- `getMonthlySummary(db, prevYear, prevMonth)` — 先月の実績（合計・親別 breakdown）（既存）
- 先月の有効予算合計は `getEffectiveBudgets(db, prevMonthKey)` の合計（既存関数）

新規クエリ・スキーマ変更なし。

## コンポーネント

- `src/app/settings/budgets/plan/page.tsx` — RSC。データロードとウィザードへの受け渡し
- `src/components/budget-plan-wizard.tsx` — client component。step 状態（1|2）、
  全体額・配分 input 群、サマリー計算、`saveBudgetPlan` 呼び出し
- 既存 `budget-settings-content.tsx` — 「予算をまとめて調整」ボタン（Link）追加のみ

## テスト（TDD）

pglite 統合（`src/actions/budgets.test.ts` に追加）:
- 新規月に複数カテゴリを一括設定 → 明示行が作られる
- 既存明示行があるカテゴリ → 金額が更新される（行は増えない）
- `amount: null` で既存明示行が削除され、引き継ぎに戻る
- `amount: null` で明示行が無い場合は no-op（エラーにならない）
- 不正入力（amount 0 / 負 / 小数、month 形式不正）→ エラー・DB 変更なし
- 子カテゴリの categoryId を渡す → エラー・全体ロールバック（他の正常 items も保存されない）

ウィザード UI（step 遷移・サマリー計算・警告表示）は手動確認。

## スコープ外

- 全体予算額の永続化・「自由枠」概念
- 未来月への一括コピー、テンプレート機能
- 予算設定画面の行単位編集の変更（従来どおり残す）
