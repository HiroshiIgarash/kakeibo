# TOP 未分類分類パネルでの親カテゴリ インライン作成 設計書

日付: 2026-07-11
ステータス: 承認待ち

## 背景・目的

TOP ページの「未分類の取引」パネル（`UnclassifiedQuickClassify`）では、既存の親カテゴリの下に
子カテゴリをインライン作成できるが、適切な**親カテゴリが存在しない場合**は設定ページ →
カテゴリ管理へ移動して親を作成する必要があり、分類フローが中断される。

本機能は、分類パネル内で親カテゴリ＋子カテゴリを一括作成し、そのまま分類を完了できるようにする。

## 前提（現状の仕様）

- カテゴリは厳格な 2 階層。親は `kind`（fixed / variable）と `color` を持ち、子は親の `kind` を継承する。
- 取引・店舗マッピングは**子カテゴリにのみ**紐づく。親単体では分類が完結しない。
- `createCategory`（`src/actions/categories.ts`）は親作成（`parentId: null` + `kind` 必須）・
  子作成（`parentId` 指定、`kind` は親から継承）の両方に対応済み。
- `ParentCategoryOption`（`src/lib/queries.ts`）は `{ id, name, color }` を持ち、TOP の RSC から
  `CategoryPicker` に渡されている。クエリ変更は不要。

## UI 設計（`src/components/unclassified-quick-classify.tsx` / `CategoryPicker`）

「新しいカテゴリ」フォームを次のように拡張する。

```
┌ 新しいカテゴリ ──────────────┐
│ 親: [＋新しい親カテゴリ ▼]   │  ← 既存親 option の末尾に追加（値 "__new__"）
│ ├ 親カテゴリ名: [______]     │  ┐
│ ├ 種別: (•)変動費 ( )固定費  │  ├ "__new__" 選択時のみ展開
│ ├ 色: ●●●○●●●●●●            │  ┘ 未使用色を初期選択済み
│ 子カテゴリ名: [______]       │
│              [作成して分類]  │
└──────────────────────────────┘
```

- 親セレクトの末尾に `＋新しい親カテゴリ`（値 `"__new__"`）を追加する。
- `"__new__"` 選択時、以下を展開する:
  - 親カテゴリ名 input
  - 種別ラジオ（変動費をデフォルト選択。クレカ通知経由の取引はほぼ変動費のため）
  - 色スウォッチ（プリセット 10 色）。既存親が未使用の色を初期選択する。タップで変更可。
- 「作成して分類」押下時:
  - 既存親選択時: 従来どおり `createCategory`（子のみ作成）→ `onPick(子id)`。
  - `"__new__"` 選択時: `createCategoryWithParent` → `onPick(子id)`。
- 親カテゴリがゼロ件の場合: 現在の「先に設定画面で親カテゴリを作成してください」メッセージを
  廃止し、最初から新規親モード（セレクトは `"__new__"` 固定）でフォームを表示する。

### バリデーション（クライアント側の事前チェック）

- 子カテゴリ名: 必須（既存挙動を踏襲）
- 新規親モード時: 親カテゴリ名も必須

## 色プリセットの共通化（`src/lib/category-colors.ts` 新設）

- `PRESET_COLORS`（現在 `category-management-content.tsx` にハードコード）を
  `src/lib/category-colors.ts` へ抽出し、両コンポーネントから import する（DRY）。
- `pickUnusedColor(usedColors: (string | null)[]): string` を同ファイルに実装する:
  - プリセット順に走査し、`usedColors` に含まれない最初の色を返す。
  - 全色使用済みの場合はプリセット先頭色を返す（循環はさせずシンプルに先頭固定）。
- 使用済み色は `parentOptions` の `color` から算出する（クライアント側）。

## Server Action（`src/actions/categories.ts` に追加）

```ts
export async function createCategoryWithParent(input: {
  parentName: string;
  kind: "fixed" | "variable";
  color?: string | null;
  childName: string;
}): Promise<ActionResult & { id?: string }>  // id = 作成された子カテゴリの id
```

- zod でバリデーション: `parentName` / `childName` は trim + min(1)、`kind` は enum。
- **単一 DB トランザクション**で親 → 子の順に insert する。子の insert が失敗した場合は
  ロールバックし、孤児親を残さない（取引 insert + アラート判定を同一 tx で行う既存方針と同じ）。
- 子は親の `kind` を継承し、`color` は null（既存の子作成と同じ）。
- 成功時 `revalidatePath("/settings/categories")` と `revalidatePath("/")`。
- 既存 `createCategory` を 2 回呼ぶクライアント側逐次実行は採用しない（原子性のため）。

## テスト（TDD）

### ユニット（Vitest / `src/lib/category-colors.test.ts`）

- `pickUnusedColor`: 空配列 → 先頭色 / 一部使用 → 最初の未使用色 / 全色使用 → 先頭色 /
  null 混在（色未設定の親）を無視すること

### pglite 統合（`createCategoryWithParent`）

- 正常系: 親＋子が作成され子 id が返る。子の `kind` が親と一致。親の `color` が保存される。
- 異常系: `parentName` 空 / `childName` 空 / `kind` 不正 → errors 返却・DB 変更なし。
- 原子性: 子 insert 失敗時に親が残らないこと。

### コンポーネント挙動（既存テスト方針に合わせ、Server Action 層でカバー）

UI の分岐（`"__new__"` 展開・親ゼロ時の直接表示）は手動確認とする（既存コンポーネントに
テストがない方針を踏襲）。

## スコープ外

- `transaction-form-sheet.tsx`（手動取引フォーム）・`mapping-management-content.tsx` の
  ピッカーへの同機能追加（要望は TOP 未分類パネルのみ）。
- 親カテゴリの sortOrder 指定・アイコン等の追加属性。
