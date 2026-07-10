# 未分類取引のクイック分類（ホームTOP）設計（2026-07-10）

## 目的
未分類の取引（メール取り込み直後はすべて未分類）をホーム画面の最上部に提示し、
その場で「店名ごとにまとめて」カテゴリ分類できるようにする。分類と同時に
店舗マッピングを登録し、以後の取り込みが自動分類されるようにする（方式A、ユーザー承認済み）。

## 挙動
- ホーム（`/`）の最上部に「未分類の取引」セクションを表示（未分類が0件なら非表示）
- 未分類取引を**店名でグルーピング**して表示: `店名 / ×N件 / 合計金額`。件数の多い順
- 行をタップ → カテゴリ選択パネルを展開（既存カテゴリ一覧 + 「＋新しいカテゴリ」）
- カテゴリを選ぶ → 既存の `upsertStoreMapping({storeName, categoryId})` を呼ぶ
  （マッピング登録 + 同一店名の未分類取引を一括再分類 + アラート評価 + 未分類アラートrefresh、
  すべて既存実装の同一トランザクション処理）→ `router.refresh()`
- 「＋新しいカテゴリ」→ 名前入力 + 種別（変動費デフォルト/固定費）→ `createCategory` →
  作成されたカテゴリでそのまま分類を続行

## 実装

### 既存action拡張 `src/actions/categories.ts`
- `createCategory` の戻り値を `ActionResult & { id?: string }` に拡張（作成したカテゴリのidを返す）。
  既存の呼び出し元（category-management-content.tsx）は `errors` しか見ていないため互換

### 新loader `src/lib/queries.ts`
`loadUnclassifiedGroups(db): Promise<UnclassifiedGroup[]>`
- `transactions WHERE category_id IS NULL` を `store_name` でGROUP BY
- 返却行: `{ storeName: string, count: number, totalAmount: number }`
- 並び: count 降順 → storeName 昇順

### UI
- `src/app/page.tsx`: `loadUnclassifiedGroups` + `loadCategoryOptions` を既存 Promise.all に追加し、
  最上部に `<UnclassifiedQuickClassify>` を配置（0件なら描画しない）
- `src/components/unclassified-quick-classify.tsx`（新規、"use client"）:
  - グループ行タップで展開式のカテゴリ選択（既存カテゴリをカラードット付きで列挙）
  - 選択 → `upsertStoreMapping` → refresh。処理中スピナー、エラー行内表示
  - 「＋新しいカテゴリ」→ インライン入力（名前、種別トグル）→ `createCategory` → 返却idで続けて `upsertStoreMapping`

## テスト（pglite。UIは既存方針どおり対象外）
- loader: グルーピング・件数・合計・null カテゴリのみ対象・並び順
- createCategory: id が返る（既存テストに追記）
- upsertStoreMapping の一括再分類は B-Task9 で網羅済み（変更なし）

## スコープ外
- 取引1件単位の分類（既存の取引編集フォームで可能）
- マッピングを作らない分類モード
