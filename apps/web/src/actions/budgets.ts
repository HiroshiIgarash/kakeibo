"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { budgets } from "@/db/schema";

export type ActionResult = { errors: string[] };

const upsertSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.number().int().positive("金額は1以上で入力してください"),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "月の形式が不正です"),
});
const deleteSchema = z.object({ id: z.string().min(1) });

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
