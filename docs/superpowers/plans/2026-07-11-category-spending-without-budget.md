# 予算なしカテゴリの支出表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「カテゴリ別予算」セクションを「カテゴリ別」に拡張し、予算なしカテゴリの実績行と未分類合計行を表示する。

**Architecture:** `MonthlySummary` に `unclassifiedAmount`（totalAmount − 分類済み合計）を追加し、ビュー→ページ→`BudgetList` へ受け渡す。`BudgetList` は予算ありカード（現行不変）→予算なし軽量行（金額降順）→未分類行の3段構成に変更。新クエリなし。

**Tech Stack:** TypeScript / Vitest + pglite

**Spec:** `docs/superpowers/specs/2026-07-11-category-spending-without-budget-design.md`

## Global Constraints

- 実装は git worktree 上（ベース: development）
- テスト実行: `pnpm -C apps/web test <path>` / コミット: Conventional Commits + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 予算ありカードの見た目・挙動は不変。UI 文言は日本語・既存トーン踏襲

---

### Task 1: `unclassifiedAmount` の算出（TDD）

**Files:**
- Modify: `apps/web/src/lib/monthly-summary.ts`（型 + return）
- Test: `apps/web/src/lib/monthly-summary.test.ts`

**Interfaces:**
- Produces: `MonthlySummary.unclassifiedAmount: number`

- [ ] **Step 1: Write the failing tests**

`monthly-summary.test.ts` 末尾に:

```ts
describe("getMonthlySummary: 未分類合計", () => {
  it("カテゴリ未設定の取引合計が unclassifiedAmount になる", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await db.insert(transactions).values([
      { amount: 3000, storeName: "a", purchasedAt: jst("2024-01-02T10:00:00+09:00"), categoryId: food.id, source: "manual" },
      { amount: 5000, storeName: "b", purchasedAt: jst("2024-01-03T10:00:00+09:00"), categoryId: null, source: "email" },
      { amount: 2000, storeName: "c", purchasedAt: jst("2024-01-04T10:00:00+09:00"), categoryId: null, source: "email" },
    ]);
    const r = await getMonthlySummary(db, 2024, 1);
    expect(r.totalAmount).toBe(10000);
    expect(r.unclassifiedAmount).toBe(7000);
  });

  it("全て分類済みなら 0", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await db.insert(transactions).values({
      amount: 3000, storeName: "a", purchasedAt: jst("2024-01-02T10:00:00+09:00"), categoryId: food.id, source: "manual",
    });
    expect((await getMonthlySummary(db, 2024, 1)).unclassifiedAmount).toBe(0);
  });

  it("取引ゼロなら 0", async () => {
    expect((await getMonthlySummary(db, 2024, 1)).unclassifiedAmount).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web test src/lib/monthly-summary.test.ts`
Expected: FAIL（unclassifiedAmount undefined）

- [ ] **Step 3: Write minimal implementation**

`monthly-summary.ts`:
- `MonthlySummary` 型に `unclassifiedAmount: number;` を追加
- return 直前で算出して返す:

```ts
  // カテゴリ未設定の取引合計（分類済み breakdown との差分。表示側の「未分類」行に使う）
  let classifiedTotal = 0;
  for (const b of categoryBreakdowns) classifiedTotal += b.amount;
  const unclassifiedAmount = totalAmount - classifiedTotal;

  return {
    totalAmount,
    budgetAmount,
    remainingAmount: budgetAmount - totalAmount,
    unclassifiedAmount,
    categoryBreakdowns,
  };
```

- [ ] **Step 4: Run tests to verify they pass** → PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/monthly-summary.ts apps/web/src/lib/monthly-summary.test.ts
git commit -m "feat(web): expose unclassified spending total in monthly summary"
```

---

### Task 2: ビュー受け渡し + BudgetList 3段表示 + ページ

**Files:**
- Modify: `apps/web/src/lib/queries.ts`（`MonthlySummaryView` 型 + `loadMonthlySummaryView`）
- Modify: `apps/web/src/components/budget-list.tsx`
- Modify: `apps/web/src/app/page.tsx` / `apps/web/src/app/transactions/[year]/[month]/page.tsx`

**Interfaces:**
- Consumes: Task 1 の `unclassifiedAmount`
- Produces: `BudgetList` Props に `unclassifiedAmount: number` 追加

- [ ] **Step 1: ビューに透過**

`queries.ts` の `MonthlySummaryView` 型に `unclassifiedAmount: number;` を追加し、
`loadMonthlySummaryView` の return に `unclassifiedAmount: s.unclassifiedAmount,` を追加。

- [ ] **Step 2: BudgetList 変更**

`budget-list.tsx`:
- Props に `unclassifiedAmount: number` 追加
- 見出しを「カテゴリ別」へ変更（2箇所: 空状態側と通常側）
- フィルタを2分割:

```ts
  const budgeted = breakdowns.filter(
    (b): b is CategoryBreakdown & { budgetAmount: number } => b.budgetAmount != null
  );
  const unbudgeted = breakdowns
    .filter((b) => b.budgetAmount == null && b.amount > 0)
    .sort((a, b) => b.amount - a.amount);
```

- 空状態条件: `budgeted.length === 0 && unbudgeted.length === 0 && unclassifiedAmount <= 0`
- 予算ありカードの `<ul>` はそのまま（`parentBreakdowns` → `budgeted` に改名）
- その下に予算なし行（unbudgeted が空なら描画しない）:

```tsx
      {unbudgeted.length > 0 && (
        <ul role="list" className="flex flex-col gap-2 mt-3">
          {unbudgeted.map((b) => (
            <li key={b.categoryId} className="list-none">
              <div className="px-4 py-3 rounded-lg border border-border bg-card text-card-foreground">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{b.categoryName}</span>
                  <span className="text-sm font-mono">
                    ¥{b.amount.toLocaleString()}
                    <span className="ml-2 text-xs text-muted-foreground">予算未設定</span>
                  </span>
                </div>
                {b.children != null && b.children.length > 0 && (
                  <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none">内訳</summary>
                    <ul role="list" className="mt-1 flex flex-col gap-1">
                      {b.children.map((child) => (
                        <li key={child.categoryId} className="list-none flex items-center justify-between">
                          <span>{child.categoryName}</span>
                          <span className="font-mono">¥{child.amount.toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {unclassifiedAmount > 0 && (
        <div className="mt-2 px-4 py-3 rounded-lg border border-dashed border-border text-muted-foreground flex items-center justify-between">
          <span className="text-sm">未分類</span>
          <span className="text-sm font-mono">¥{unclassifiedAmount.toLocaleString()}</span>
        </div>
      )}
```

- [ ] **Step 3: 両ページで prop を渡す**

`page.tsx` / `transactions/[year]/[month]/page.tsx` の `<BudgetList ...>` に
`unclassifiedAmount={monthlySummary.unclassifiedAmount}` を追加。

- [ ] **Step 4: 全テスト・lint・build**

Run: `pnpm -C apps/web test && pnpm -C apps/web lint && pnpm -C apps/web build`
Expected: 全 PASS / 変更ファイル指摘なし / build 成功

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/queries.ts apps/web/src/components/budget-list.tsx apps/web/src/app/page.tsx "apps/web/src/app/transactions/[year]/[month]/page.tsx"
git commit -m "feat(web): show unbudgeted category spending and unclassified total"
```

---

## 手動確認

- 5月の支出ページ: 食費カード + 趣味/通販の行 + 未分類 ¥125,780 行。合計が SummaryCard と一致
- TOP（当月）: 既存カード表示は不変、未分類行が出る（未分類取引ありの場合）
