"use server";

import { z } from "zod";
import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { storeCategoryMappings, transactions } from "@/db/schema";
import { evaluateAlertsForTransaction, refreshUnclassifiedAlert } from "@/lib/alerts";
import { normalizeStoreName } from "@/lib/store-name";

export type ActionResult = { errors: string[] };

const upsertSchema = z.object({
  storeName: z.string().trim().min(1, "店名を入力してください"),
  categoryId: z.string().min(1, "カテゴリを選択してください"),
});
const deleteSchema = z.object({ id: z.string().min(1) });

export async function upsertStoreMapping(input: {
  storeName: string;
  categoryId: string;
}): Promise<ActionResult> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const normalized = normalizeStoreName(parsed.data.storeName);
  const numericCat = Number(parsed.data.categoryId);

  await db.transaction(async (tx) => {
    // find_or_initialize_by(store_name) 相当の upsert
    const existing = await tx
      .select({ id: storeCategoryMappings.id })
      .from(storeCategoryMappings)
      .where(eq(storeCategoryMappings.storeName, normalized))
      .limit(1);
    if (existing.length > 0) {
      await tx
        .update(storeCategoryMappings)
        .set({ categoryId: numericCat })
        .where(eq(storeCategoryMappings.id, existing[0].id));
    } else {
      await tx.insert(storeCategoryMappings).values({ storeName: normalized, categoryId: numericCat });
    }

    // spec §5.6/§13: 同名の未分類取引を事後分類する。取引 store_name は生値のため JS 側で NFKC 比較する
    const unclassified = await tx
      .select({ id: transactions.id, storeName: transactions.storeName })
      .from(transactions)
      .where(isNull(transactions.categoryId));
    const targetIds = unclassified
      .filter((t) => normalizeStoreName(t.storeName) === normalized)
      .map((t) => t.id);
    for (const id of targetIds) {
      await tx.update(transactions).set({ categoryId: numericCat }).where(eq(transactions.id, id));
      await evaluateAlertsForTransaction(tx, id);
    }
    if (targetIds.length > 0) await refreshUnclassifiedAlert(tx);
  });

  revalidatePath("/settings/mappings");
  revalidatePath("/");
  return { errors: [] };
}

export async function deleteStoreMapping(input: { id: string }): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const deleted = await db
    .delete(storeCategoryMappings)
    .where(eq(storeCategoryMappings.id, Number(parsed.data.id)))
    .returning({ id: storeCategoryMappings.id });
  if (deleted.length === 0) return { errors: [`IDが見つかりません: ${input.id}`] };
  revalidatePath("/settings/mappings");
  return { errors: [] };
}
