# 予算一括調整ウィザード Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全体予算額と先月実績を見ながらカテゴリ予算を一括調整するウィザード（/settings/budgets/plan）を追加する。

**Architecture:** 一括保存 Server Action `saveBudgetPlan`（単一tx で upsert/delete）+ RSC ページ（既存 `loadBudgetSettingsView` / `getMonthlySummary` を再利用）+ client ウィザード（step 状態のみ）。DB 変更なし。月パラメータ解決は既存ページと共通化のため `src/lib/month-param.ts` へ抽出。

**Tech Stack:** Next.js 16 (RSC / Server Actions), zod, Vitest + pglite

**Spec:** `docs/superpowers/specs/2026-07-11-budget-plan-wizard-design.md`
（1点補正: month クエリは既存 `/settings/budgets` と同じ `?month=YYYY-MM` 形式に統一する）

## Global Constraints

- 実装は git worktree 上（ベース: development）
- テスト実行: `pnpm -C apps/web test <path>` / コミットは Conventional Commits + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- TDD（Server Action）。UI はテスト無し・手動確認（既存方針）
- UI 文言は日本語、既存の Tailwind トーン・`Input`/`Button`/`Card` 共通部品を使用
- 日付演算は `@/lib/dates`（JST 固定）のみ使用

---

### Task 1: `saveBudgetPlan` Server Action（TDD）

**Files:**
- Modify: `apps/web/src/actions/budgets.ts`
- Modify: `apps/web/src/actions/budgets.test.ts`

**Interfaces:**
- Consumes: `monthSchema` / `budgets` / `getCategoryRole`（同ファイル既存 import）
- Produces:
  ```ts
  export async function saveBudgetPlan(input: {
    month: string; // 'YYYY-MM-DD'（monthSchema が月初へ正規化）
    items: { categoryId: string; amount: number | null }[];
  }): Promise<ActionResult>
  ```

- [ ] **Step 1: Write the failing tests**

`apps/web/src/actions/budgets.test.ts` — import 行に `saveBudgetPlan` を追加し、末尾に:

```ts
describe("saveBudgetPlan", () => {
  it("複数カテゴリを一括で明示行として保存する", async () => {
    const [food] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [fun] = await testDb.insert(categories).values({ name: "娯楽", kind: "variable" }).returning();
    const res = await saveBudgetPlan({
      month: "2026-08-01",
      items: [
        { categoryId: String(food.id), amount: 30000 },
        { categoryId: String(fun.id), amount: 10000 },
      ],
    });
    expect(res.errors).toEqual([]);
    const rows = await testDb.select().from(budgets);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.amount).sort()).toEqual([10000, 30000]);
    expect(new Set(rows.map((r) => r.month))).toEqual(new Set(["2026-08-01"]));
  });

  it("既存の明示行は更新され、行が増えない", async () => {
    const [food] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await testDb.insert(budgets).values({ categoryId: food.id, month: "2026-08-01", amount: 20000 });
    const res = await saveBudgetPlan({
      month: "2026-08-01",
      items: [{ categoryId: String(food.id), amount: 35000 }],
    });
    expect(res.errors).toEqual([]);
    const rows = await testDb.select().from(budgets);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(35000);
  });

  it("amount null で明示行が削除される（引き継ぎに戻る）", async () => {
    const [food] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await testDb.insert(budgets).values({ categoryId: food.id, month: "2026-08-01", amount: 20000 });
    const res = await saveBudgetPlan({
      month: "2026-08-01",
      items: [{ categoryId: String(food.id), amount: null }],
    });
    expect(res.errors).toEqual([]);
    expect(await testDb.select().from(budgets)).toHaveLength(0);
  });

  it("amount null で明示行が無ければ no-op", async () => {
    const [food] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const res = await saveBudgetPlan({
      month: "2026-08-01",
      items: [{ categoryId: String(food.id), amount: null }],
    });
    expect(res.errors).toEqual([]);
    expect(await testDb.select().from(budgets)).toHaveLength(0);
  });

  it("他月の明示行には影響しない", async () => {
    const [food] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    await testDb.insert(budgets).values({ categoryId: food.id, month: "2026-07-01", amount: 20000 });
    await saveBudgetPlan({ month: "2026-08-01", items: [{ categoryId: String(food.id), amount: null }] });
    const rows = await testDb.select().from(budgets);
    expect(rows).toHaveLength(1);
    expect(rows[0].month).toBe("2026-07-01");
  });

  it("不正な amount（0・負・小数）は拒否・DB変更なし", async () => {
    const [food] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    for (const amount of [0, -100, 100.5]) {
      const res = await saveBudgetPlan({
        month: "2026-08-01",
        items: [{ categoryId: String(food.id), amount }],
      });
      expect(res.errors.length).toBeGreaterThan(0);
    }
    expect(await testDb.select().from(budgets)).toHaveLength(0);
  });

  it("子カテゴリが混ざると全体ロールバック", async () => {
    const [food] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [child] = await testDb
      .insert(categories)
      .values({ name: "外食", kind: "variable", parentId: food.id })
      .returning();
    const res = await saveBudgetPlan({
      month: "2026-08-01",
      items: [
        { categoryId: String(food.id), amount: 30000 },
        { categoryId: String(child.id), amount: 5000 },
      ],
    });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(budgets)).toHaveLength(0); // 正常分も保存されない
  });

  it("存在しないカテゴリはエラー・全体ロールバック", async () => {
    const [food] = await testDb.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const res = await saveBudgetPlan({
      month: "2026-08-01",
      items: [
        { categoryId: String(food.id), amount: 30000 },
        { categoryId: "999999", amount: 1000 },
      ],
    });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(await testDb.select().from(budgets)).toHaveLength(0);
  });
});
```

（budgets.test.ts の既存 import に `budgets` テーブルが無ければ追加する）

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web test src/actions/budgets.test.ts`
Expected: FAIL（`saveBudgetPlan is not a function`）

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/actions/budgets.ts` — schema 群に追加:

```ts
const planItemSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.union([z.number().int().positive("金額は1以上で入力してください"), z.null()]),
});
const savePlanSchema = z.object({
  month: monthSchema,
  items: z.array(planItemSchema),
});
```

`deleteBudget` の後に追加:

```ts
// 予算一括調整ウィザード用: 対象月の明示行を items でまとめて upsert / delete する。
// 一部でも不正（子カテゴリ・存在しないカテゴリ）なら全体をロールバックする。
export async function saveBudgetPlan(input: {
  month: string;
  items: { categoryId: string; amount: number | null }[];
}): Promise<ActionResult> {
  const parsed = savePlanSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { month, items } = parsed.data;

  let errors: string[] = [];
  await db
    .transaction(async (tx) => {
      for (const item of items) {
        const numericCat = Number(item.categoryId);
        const role = await getCategoryRole(tx, numericCat);
        if (role == null) {
          errors = [`カテゴリが見つかりません: ${item.categoryId}`];
          throw new Error("__rollback__");
        }
        if (role !== "parent") {
          errors = ["親カテゴリを指定してください"];
          throw new Error("__rollback__");
        }
        const existing = await tx
          .select({ id: budgets.id })
          .from(budgets)
          .where(and(eq(budgets.categoryId, numericCat), eq(budgets.month, month)))
          .limit(1);
        if (item.amount == null) {
          if (existing.length > 0) await tx.delete(budgets).where(eq(budgets.id, existing[0].id));
        } else if (existing.length > 0) {
          await tx.update(budgets).set({ amount: item.amount }).where(eq(budgets.id, existing[0].id));
        } else {
          await tx.insert(budgets).values({ categoryId: numericCat, month, amount: item.amount });
        }
      }
    })
    .catch((e) => {
      if (!(e instanceof Error && e.message === "__rollback__")) throw e;
    });

  if (errors.length > 0) return { errors };
  revalidatePath("/");
  revalidatePath("/settings/budgets");
  return { errors: [] };
}
```

（`getCategoryRole` は Db/DbTransaction 両対応（`Db` は共通基底）。budgets.ts の import に不足があれば追加）

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web test src/actions/budgets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/actions/budgets.ts apps/web/src/actions/budgets.test.ts
git commit -m "feat(web): add saveBudgetPlan bulk upsert action"
```

---

### Task 2: month パラメータ解決の共通化

**Files:**
- Create: `apps/web/src/lib/month-param.ts`
- Modify: `apps/web/src/app/settings/budgets/page.tsx`（ローカル関数を import に置換）

**Interfaces:**
- Produces:
  ```ts
  export function resolveMonthParam(param: string | undefined): { year: number; month: number };
  export function monthParam(year: number, month: number): string; // 'YYYY-MM'
  ```

- [ ] **Step 1: 抽出**

`apps/web/src/lib/month-param.ts`:

```ts
import { jstDateParts, jstToday } from "./dates";

/** `?month=YYYY-MM` を解決する。不正・未指定は当月（JST）へフォールバック */
export function resolveMonthParam(param: string | undefined): { year: number; month: number } {
  if (param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param)) {
    const [year, month] = param.split("-").map(Number);
    return { year, month };
  }
  const today = jstDateParts(jstToday());
  return { year: today.year, month: today.month };
}

/** {year, month} → 'YYYY-MM'（month クエリ値） */
export function monthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
```

`settings/budgets/page.tsx` のローカル `resolveMonth` / `monthParam` を削除し、
`import { resolveMonthParam, monthParam } from "@/lib/month-param";` に置換
（呼び出し名 `resolveMonth` → `resolveMonthParam`）。

- [ ] **Step 2: テストで回帰確認**

Run: `pnpm -C apps/web test`
Expected: 全 PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/month-param.ts apps/web/src/app/settings/budgets/page.tsx
git commit -m "refactor(web): extract month query param helpers"
```

---

### Task 3: ウィザードページ + コンポーネント + エントリボタン

**Files:**
- Create: `apps/web/src/app/settings/budgets/plan/page.tsx`
- Create: `apps/web/src/components/budget-plan-wizard.tsx`
- Modify: `apps/web/src/components/budget-settings-content.tsx`（エントリボタン追加）

**Interfaces:**
- Consumes: `saveBudgetPlan`（Task 1）、`resolveMonthParam`/`monthParam`（Task 2）、
  `loadBudgetSettingsView` / `getMonthlySummary` / `getEffectiveBudgets` / `monthKey`（既存）

- [ ] **Step 1: RSC ページ**

`apps/web/src/app/settings/budgets/plan/page.tsx`:

```tsx
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db/client";
import { loadBudgetSettingsView } from "@/lib/queries";
import { getMonthlySummary } from "@/lib/monthly-summary";
import { monthKey } from "@/lib/dates";
import { resolveMonthParam, monthParam } from "@/lib/month-param";
import { BudgetPlanWizard } from "@/components/budget-plan-wizard";

export const dynamic = "force-dynamic";

export default async function BudgetPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthQuery } = await searchParams;
  const { year, month } = resolveMonthParam(monthQuery);
  const mKey = monthKey(year, month);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

  const [rows, prevSummary] = await Promise.all([
    loadBudgetSettingsView(db, mKey),
    getMonthlySummary(db, prev.year, prev.month),
  ]);

  // 先月の親カテゴリ別実績（breakdown の categoryId は number なので文字列化して引く）
  const prevSpentByCategory = new Map(
    prevSummary.categoryBreakdowns.map((b) => [String(b.categoryId), b.amount]),
  );

  const planCategories = rows.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    // 明示・引き継ぎを問わず現在の有効予算をプリフィル
    currentAmount: r.amount ?? r.inherited?.amount ?? null,
    lastMonthSpent: prevSpentByCategory.get(r.categoryId) ?? 0,
  }));
  const currentTotalBudget = planCategories.reduce((acc, c) => acc + (c.currentAmount ?? 0), 0);
  const backHref = `/settings/budgets?month=${monthParam(year, month)}`;

  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
        <header>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3 -ml-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            予算設定に戻る
          </Link>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Settings
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">
            {year}年{month}月の予算を調整
          </h1>
        </header>

        <BudgetPlanWizard
          month={mKey}
          backHref={backHref}
          prevMonthLabel={`${prev.year}年${prev.month}月`}
          lastMonthTotalSpent={prevSummary.totalAmount}
          lastMonthTotalBudget={prevSummary.budgetAmount}
          currentTotalBudget={currentTotalBudget}
          categories={planCategories}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: ウィザード client component**

`apps/web/src/components/budget-plan-wizard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveBudgetPlan } from "@/actions/budgets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PlanCategory = {
  categoryId: string;
  categoryName: string;
  currentAmount: number | null;
  lastMonthSpent: number;
};

type Props = {
  month: string; // 'YYYY-MM-01'
  backHref: string;
  prevMonthLabel: string; // '2026年6月'
  lastMonthTotalSpent: number;
  lastMonthTotalBudget: number;
  currentTotalBudget: number;
  categories: PlanCategory[];
};

/** 数値input文字列 → 正の整数 or null（空・不正はnull） */
function parseAmount(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function BudgetPlanWizard({
  month,
  backHref,
  prevMonthLabel,
  lastMonthTotalSpent,
  lastMonthTotalBudget,
  currentTotalBudget,
  categories,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [totalInput, setTotalInput] = useState(
    String(currentTotalBudget > 0 ? currentTotalBudget : lastMonthTotalSpent || ""),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(
      categories.map((c) => [c.categoryId, c.currentAmount == null ? "" : String(c.currentAmount)]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = parseAmount(totalInput) ?? 0;
  const allocated = categories.reduce(
    (acc, c) => acc + (parseAmount(amounts[c.categoryId]) ?? 0),
    0,
  );
  const remaining = total - allocated;

  async function handleSave() {
    setError(null);
    setSaving(true);
    const result = await saveBudgetPlan({
      month,
      items: categories.map((c) => ({
        categoryId: c.categoryId,
        amount: parseAmount(amounts[c.categoryId]),
      })),
    });
    setSaving(false);
    if (result.errors.length > 0) {
      setError(result.errors.join(", "));
      return;
    }
    router.push(backHref);
    router.refresh();
  }

  if (step === 1) {
    return (
      <Card className="py-0">
        <CardContent className="p-5 flex flex-col gap-4">
          <p className="text-sm font-medium text-card-foreground">① 今月全体でいくら使うかを決める</p>
          <dl className="text-xs text-muted-foreground flex flex-col gap-1 font-mono">
            <div className="flex justify-between">
              <dt>{prevMonthLabel}の支出</dt>
              <dd>¥{lastMonthTotalSpent.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{prevMonthLabel}の予算合計</dt>
              <dd>¥{lastMonthTotalBudget.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt>現在の予算合計</dt>
              <dd>¥{currentTotalBudget.toLocaleString()}</dd>
            </div>
          </dl>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">¥</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={totalInput}
              onChange={(e) => setTotalInput(e.target.value)}
              placeholder="全体の予算額"
              autoFocus
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={total <= 0} onClick={() => setStep(2)}>
              次へ：カテゴリに配分
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 配分サマリー（固定表示） */}
      <div className="sticky top-0 z-10 rounded-lg border border-border bg-card text-card-foreground p-4 shadow-sm">
        <p className="text-sm font-medium mb-1">② カテゴリに配分する</p>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-muted-foreground">全体 ¥{total.toLocaleString()}</span>
          <span className="text-muted-foreground">配分済み ¥{allocated.toLocaleString()}</span>
          <span className={cn("font-medium", remaining < 0 ? "text-red-500" : "text-emerald-600")}>
            {remaining < 0 ? `¥${Math.abs(remaining).toLocaleString()} オーバー` : `残り ¥${remaining.toLocaleString()}`}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {categories.map((c) => (
          <div
            key={c.categoryId}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card text-card-foreground"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.categoryName}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {prevMonthLabel}: ¥{c.lastMonthSpent.toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">¥</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={amounts[c.categoryId]}
                onChange={(e) =>
                  setAmounts((prev) => ({ ...prev, [c.categoryId]: e.target.value }))
                }
                placeholder="未設定"
                className="w-28 text-right"
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        空欄はこの月の設定なし（過去に設定した月があればその額を引き継ぎます）。
        全体額はガイドのため、合計が一致していなくても保存できます。
      </p>
      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>
          全体額を変更
        </Button>
        <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "この内容で設定"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: エントリボタン追加**

`apps/web/src/components/budget-settings-content.tsx` — Props に `planHref: string` を追加し、
月ナビの行（`<div className="flex items-center gap-2">`）の直後に:

```tsx
      <Link
        href={planHref}
        className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
      >
        予算をまとめて調整
      </Link>
```

`settings/budgets/page.tsx` の `<BudgetSettingsContent ...>` に
`planHref={`/settings/budgets/plan?month=${monthParam(year, month)}`}` を追加。

- [ ] **Step 4: 全テスト・lint・build**

Run: `pnpm -C apps/web test && pnpm -C apps/web lint && pnpm -C apps/web build`
Expected: 全 PASS / 変更ファイルに lint 指摘なし / build 成功

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/settings/budgets apps/web/src/components/budget-plan-wizard.tsx apps/web/src/components/budget-settings-content.tsx
git commit -m "feat(web): add budget plan wizard for bulk monthly allocation"
```

---

## 最終確認（手動）

1. 予算設定 → 「予算をまとめて調整」→ ステップ①に先月の支出/予算・現予算合計が出る
2. 全体額を入れて次へ → 配分リスト（先月実績付き・現予算プリフィル）とサマリーが出る
3. 配分を変えると「残り」が追従し、超過で赤表示
4. 「この内容で設定」→ 予算設定画面に反映・TOPの合計予算も更新
5. 空欄保存 → 明示行が消え「引き継ぎ中」表示に戻る
