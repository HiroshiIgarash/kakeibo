"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { budgets } from "@/db/schema";
import { getCategoryRole } from "@/lib/category-tree";
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
const planItemSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.union([z.number().int().positive("金額は1以上で入力してください"), z.null()]),
});
const savePlanSchema = z.object({
  month: monthSchema,
  items: z.array(planItemSchema),
});

export async function upsertBudget(input: {
  categoryId: string;
  amount: number;
  month: string;
}): Promise<ActionResult> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { categoryId, amount, month } = parsed.data;
  const numericCat = Number(categoryId);

  const role = await getCategoryRole(db, numericCat);
  if (role == null) return { errors: ["カテゴリが見つかりません"] };
  if (role !== "parent") return { errors: ["親カテゴリを指定してください"] };

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
