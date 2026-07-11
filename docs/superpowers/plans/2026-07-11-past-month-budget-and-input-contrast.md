# 過去月の予算進捗表示 + 予算入力コントラスト Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 過去月の支出ページでカテゴリ別予算の進捗を表示し、予算設定入力欄のコントラストを直す。

**Architecture:** `getMonthlySummary` で予算情報（budgetAmount/remainingAmount）とペース情報（paceStatus/dailyAmount）を分離 — 予算は全月、ペースは当月のみ。`BudgetList` のフッター条件を remainingAmount 基準に変更。`BudgetRow` に `text-card-foreground` を1つ追加。

**Tech Stack:** TypeScript / Vitest + pglite

**Spec:** `docs/superpowers/specs/2026-07-11-past-month-budget-and-input-contrast-design.md`

## Global Constraints

- 実装は git worktree 上（ベース: development）
- テスト実行: `pnpm -C apps/web test <path>`
- コミット: Conventional Commits + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- TDD: Red 確認 → 実装 → Green
- 当月の既存挙動（バッジ・1日あたり・remainingAmount の paceDate 基準値）は不変

---

### Task 1: `getMonthlySummary` の予算/ペース分離（TDD）

**Files:**
- Modify: `apps/web/src/lib/monthly-summary.ts`（categoryBreakdowns 生成ループ）
- Test: `apps/web/src/lib/monthly-summary.test.ts`

**Interfaces:**
- Produces: `CategoryBreakdown.budgetAmount`/`remainingAmount` が過去月でも設定される（型変更なし）

- [ ] **Step 1: Write the failing tests**

`monthly-summary.test.ts` 末尾に describe 追加（既存の describe と同じ `jst()` ヘルパ・トップレベル db を利用。実ファイルのヘルパ名を確認して合わせる）:

```ts
describe("getMonthlySummary: 過去月の予算進捗", () => {
  it("過去月でも budgetAmount と remainingAmount（予算−月実績）が付き、ペース系は null", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await db.insert(budgets).values({ categoryId: food.id, month: "2024-01-01", amount: 30000 });
    await db.insert(transactions).values({
      amount: 12000, storeName: "a", purchasedAt: jst("2024-01-10T10:00:00+09:00"), categoryId: food.id, source: "manual",
    });
    const r = await getMonthlySummary(db, 2024, 1); // 実行時点で必ず過去月
    const b = r.categoryBreakdowns.find((x) => x.categoryName === "食費")!;
    expect(b.budgetAmount).toBe(30000);
    expect(b.remainingAmount).toBe(18000);
    expect(b.paceStatus).toBeNull();
    expect(b.dailyAmount).toBeNull();
  });

  it("過去月で実績が予算超過なら remainingAmount がマイナス", async () => {
    const [food] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await db.insert(budgets).values({ categoryId: food.id, month: "2024-01-01", amount: 10000 });
    await db.insert(transactions).values({
      amount: 13000, storeName: "a", purchasedAt: jst("2024-01-10T10:00:00+09:00"), categoryId: food.id, source: "manual",
    });
    const r = await getMonthlySummary(db, 2024, 1);
    const b = r.categoryBreakdowns.find((x) => x.categoryName === "食費")!;
    expect(b.remainingAmount).toBe(-3000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web test src/lib/monthly-summary.test.ts`
Expected: 新規2件が FAIL（現状 budgetAmount は過去月 null）。既存テストが「過去月 breakdown の budgetAmount は null」を主張して落ちる場合はこの段階で把握する（Step 3 の後に期待値を新仕様へ更新）

- [ ] **Step 3: Write minimal implementation**

`monthly-summary.ts` の categoryBreakdowns 生成ループ内、現在の

```ts
    if (paceDate) {
      const budget = effectiveBudgets.get(categoryId);
      if (budget) {
        // 親単位のペースは親+全子の取引合算で判定する
        const targetIds = await getAlertTargetCategoryIds(db, categoryId);
        ...
        paceStatus = pace.paceStatus;
        bAmount = budget.amount;
        rAmount = pace.remainingAmount;
        dAmount = pace.dailyAmount;
      }
    }
```

を次の構造に変更（内側のペース計算コードはそのまま移動）:

```ts
    const budget = effectiveBudgets.get(categoryId);
    if (budget) {
      // 予算情報はどの月でも返す（過去月の支出ページで進捗表示するため）。
      // ペース系（バッジ・日割り）は当月のみ意味を持つ。
      bAmount = budget.amount;
      rAmount = budget.amount - amount; // 月全体の実績に対する残額（マイナス可）
      if (paceDate) {
        // 親単位のペースは親+全子の取引合算で判定する
        const targetIds = await getAlertTargetCategoryIds(db, categoryId);
        const spentRow = await db
          .select({ spent: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
          .from(transactions)
          .where(
            and(
              inArray(transactions.categoryId, targetIds),
              gte(transactions.purchasedAt, start),
              lte(transactions.purchasedAt, jstEndOfDay(paceDate)),
            ),
          );
        const spent = Number(spentRow[0].spent);
        const pace = calcBudgetPace({
          budgetAmount: budget.amount,
          spentAmount: spent,
          date: paceDate,
        });
        paceStatus = pace.paceStatus;
        rAmount = pace.remainingAmount; // 当月は従来どおり paceDate 基準
        dAmount = pace.dailyAmount;
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web test src/lib/monthly-summary.test.ts`
Expected: 新規2件 PASS。既存テストが新仕様（過去月でも budgetAmount 付与）で落ちる場合は、
その期待値を新仕様に合わせて更新して全 green にする（挙動テストの期待値変更として妥当）

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/monthly-summary.ts apps/web/src/lib/monthly-summary.test.ts
git commit -m "feat(web): expose budget progress for past months in monthly summary"
```

---

### Task 2: `BudgetList` フッター条件を remainingAmount 基準に

**Files:**
- Modify: `apps/web/src/components/budget-list.tsx:119-123`

**Interfaces:**
- Consumes: Task 1 の breakdown（過去月は dailyAmount=null で remainingAmount 非null）

- [ ] **Step 1: フッター表示を変更**

現在:

```tsx
{b.dailyAmount != null && (
  <p className="mt-2 text-xs text-muted-foreground font-mono">
    残り ¥{(b.remainingAmount ?? 0).toLocaleString()} · 1日あたり ¥{b.dailyAmount.toLocaleString()}
  </p>
)}
```

変更後:

```tsx
{b.remainingAmount != null && (
  <p className="mt-2 text-xs text-muted-foreground font-mono">
    残り ¥{b.remainingAmount.toLocaleString()}
    {b.dailyAmount != null && <> · 1日あたり ¥{b.dailyAmount.toLocaleString()}</>}
  </p>
)}
```

- [ ] **Step 2: 全テスト・lint**

Run: `pnpm -C apps/web test && pnpm -C apps/web lint`
Expected: 全 PASS / 変更ファイルに lint 指摘なし

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/budget-list.tsx
git commit -m "feat(web): show remaining amount for past-month budget cards"
```

---

### Task 3: `BudgetRow` のコントラスト修正

**Files:**
- Modify: `apps/web/src/components/budget-settings-content.tsx:55`

- [ ] **Step 1: text-card-foreground 追加**

```tsx
<div className="flex flex-col gap-1 px-4 py-3 rounded-lg border border-border bg-card text-card-foreground">
```

（`bg-card` 面に文字色が未指定で、ダークテーマだと Input がページの明色 foreground を継承して
白地に白文字になるため）

- [ ] **Step 2: build で確認**

Run: `pnpm -C apps/web build`
Expected: 成功。ダークテーマの表示は最終の手動確認項目とする

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/budget-settings-content.tsx
git commit -m "fix(web): inherit card foreground color in budget setting rows"
```

---

## 最終確認

- `pnpm -C apps/web exec vitest run` 全件 green
- 手動: ダークテーマで予算設定の入力値が読める / 支出ページで前月に移動して予算カードが出る
