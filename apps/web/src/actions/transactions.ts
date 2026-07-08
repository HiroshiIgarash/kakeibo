"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { transactions } from "@/db/schema";
import { evaluateAlertsForTransaction, refreshUnclassifiedAlert } from "@/lib/alerts";
import { jstDateInputToDate } from "@/lib/serialize";

export type ActionResult = { errors: string[] };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が不正です");
// categoryId は文字列ID または null/空。zod で数値IDへ正規化する
const optionalCategoryId = z
  .union([z.string(), z.null()])
  .transform((v) => (v == null || v === "" ? null : Number(v)))
  .refine((v) => v == null || Number.isInteger(v), "カテゴリIDが不正です");

const createSchema = z.object({
  storeName: z.string().trim().min(1, "店舗名を入力してください"),
  amount: z.number().int("金額は整数で入力してください").positive("金額は1以上の数値を入力してください"),
  purchasedAt: dateStr,
  categoryId: optionalCategoryId,
});

const updateSchema = createSchema.extend({ id: z.string().min(1) });
const deleteSchema = z.object({ id: z.string().min(1) });

export async function createTransaction(input: {
  storeName: string;
  amount: number;
  purchasedAt: string;
  categoryId: string | null;
}): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { storeName, amount, purchasedAt, categoryId } = parsed.data;

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(transactions)
      .values({
        storeName,
        amount,
        purchasedAt: jstDateInputToDate(purchasedAt),
        categoryId,
        source: "manual",
      })
      .returning({ id: transactions.id });
    if (categoryId != null) await evaluateAlertsForTransaction(tx, row.id);
    await refreshUnclassifiedAlert(tx);
  });

  revalidatePath("/", "layout");
  return { errors: [] };
}

export async function updateTransaction(input: {
  id: string;
  storeName: string;
  amount: number;
  purchasedAt: string;
  categoryId: string | null;
}): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { id, storeName, amount, purchasedAt, categoryId } = parsed.data;
  const numericId = Number(id);

  let notFound = false;
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(transactions)
      .set({ storeName, amount, purchasedAt: jstDateInputToDate(purchasedAt), categoryId })
      .where(eq(transactions.id, numericId))
      .returning({ id: transactions.id });
    if (updated.length === 0) {
      notFound = true;
      return;
    }
    if (categoryId != null) await evaluateAlertsForTransaction(tx, updated[0].id);
    await refreshUnclassifiedAlert(tx);
  });
  if (notFound) return { errors: [`IDが見つかりません: ${id}`] };

  revalidatePath("/", "layout");
  return { errors: [] };
}

export async function deleteTransaction(input: { id: string }): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const numericId = Number(parsed.data.id);

  let notFound = false;
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(transactions)
      .where(eq(transactions.id, numericId))
      .returning({ id: transactions.id });
    if (deleted.length === 0) {
      notFound = true;
      return;
    }
    await refreshUnclassifiedAlert(tx);
  });
  if (notFound) return { errors: [`IDが見つかりません: ${input.id}`] };

  revalidatePath("/", "layout");
  return { errors: [] };
}
