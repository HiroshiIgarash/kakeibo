"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { budgets } from "@/db/schema";
import { monthKey } from "@/lib/dates";

export type ActionResult = { errors: string[] };

// budgets.month は 'YYYY-MM-01' の月初キー規約（monthKey / monthly-summary / alerts のクエリ前提）。
// 非01日の入力は unique 制約 (categoryId, month) をすり抜け同月2予算になるため、月初へ正規化する。
// 月部分は 01-12 のみ許可（"2026-13-01" 等は monthKey が不正な date 値を生成し DB 例外になるため入口で拒否）。
const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/, "月の形式が不正です")
  .transform((v) => {
    const [year, month] = v.split("-").map(Number);
    return monthKey(year, month);
  });

const upsertSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.number().int().positive("金額は1以上で入力してください"),
  month: monthSchema,
});
const deleteSchema = z.object({ id: z.string().min(1) });
const copySchema = z.object({ month: monthSchema });

export async function upsertBudget(input: {
  categoryId: string;
  amount: number;
  month: string;
}): Promise<ActionResult> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { categoryId, amount, month } = parsed.data;
  const numericCat = Number(categoryId);

  // (category_id, month) の一意制約に基づく upsert
  const existing = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.categoryId, numericCat), eq(budgets.month, month)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(budgets).set({ amount }).where(eq(budgets.id, existing[0].id));
  } else {
    await db.insert(budgets).values({ categoryId: numericCat, month, amount });
  }
  revalidatePath("/");
  return { errors: [] };
}

export async function deleteBudget(input: { id: string }): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const deleted = await db.delete(budgets).where(eq(budgets.id, Number(parsed.data.id))).returning({ id: budgets.id });
  if (deleted.length === 0) return { errors: [`IDが見つかりません: ${input.id}`] };
  revalidatePath("/");
  return { errors: [] };
}

/**
 * 前月の予算を対象月へコピーする。対象月に同カテゴリの予算が既にある場合は上書きしない。
 * 戻り値の copied はコピーした件数（前月ゼロ件・全カテゴリ設定済みなら 0）。
 */
export async function copyBudgetsFromPreviousMonth(input: {
  month: string;
}): Promise<ActionResult & { copied?: number }> {
  const parsed = copySchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const targetMonth = parsed.data.month;

  const [year, month] = targetMonth.split("-").map(Number);
  const prevMonth = month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);

  const copied = await db.transaction(async (tx) => {
    const prevRows = await tx
      .select({ categoryId: budgets.categoryId, amount: budgets.amount })
      .from(budgets)
      .where(eq(budgets.month, prevMonth));
    if (prevRows.length === 0) return 0;

    const existing = await tx
      .select({ categoryId: budgets.categoryId })
      .from(budgets)
      .where(eq(budgets.month, targetMonth));
    const existingCatIds = new Set(existing.map((r) => r.categoryId));

    const toInsert = prevRows.filter((r) => !existingCatIds.has(r.categoryId));
    if (toInsert.length === 0) return 0;
    await tx
      .insert(budgets)
      .values(toInsert.map((r) => ({ categoryId: r.categoryId, month: targetMonth, amount: r.amount })));
    return toInsert.length;
  });

  revalidatePath("/");
  revalidatePath("/settings/budgets");
  return { errors: [], copied };
}
