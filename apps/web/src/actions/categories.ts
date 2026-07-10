"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  categories,
  transactions,
  budgets,
  budgetAlertSettings,
  budgetAlerts,
  paceAlertSettings,
  paceAlerts,
  storeCategoryMappings,
} from "@/db/schema";
import type { DbTransaction } from "@/db/schema";
import { loadCategoryOptions, type CategoryOption } from "@/lib/queries";

export type ActionResult = { errors: string[] };

const kindEnum = z.enum(["fixed", "variable"]);
const createSchema = z.object({
  name: z.string().trim().min(1, "カテゴリ名を入力してください"),
  kind: kindEnum.optional(),
  color: z.union([z.string(), z.null()]).optional(),
  parentId: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null || v === "" ? null : Number(v)))
    .refine((v) => v == null || Number.isInteger(v), "親カテゴリIDが不正です"),
});
const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "カテゴリ名を入力してください"),
  color: z.union([z.string(), z.null()]).optional(),
});
const deleteSchema = z.object({ id: z.string().min(1) });

export async function getCategoryOptions(): Promise<CategoryOption[]> {
  return loadCategoryOptions(db);
}

export async function createCategory(input: {
  name: string;
  kind?: "fixed" | "variable";
  color?: string | null;
  parentId?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { name, kind, color, parentId } = parsed.data;

  let values: { name: string; kind: "fixed" | "variable"; color: string | null; parentId: number | null };
  if (parentId == null) {
    if (kind == null) return { errors: ["種別を選択してください"] };
    values = { name, kind, color: color ?? null, parentId: null };
  } else {
    const parent = (
      await db
        .select({ id: categories.id, kind: categories.kind, parentId: categories.parentId })
        .from(categories)
        .where(eq(categories.id, parentId))
        .limit(1)
    )[0];
    if (!parent) return { errors: [`親カテゴリが見つかりません: ${parentId}`] };
    if (parent.parentId != null) return { errors: ["子カテゴリの下にカテゴリは作成できません"] };
    values = { name, kind: parent.kind, color: null, parentId };
  }

  const [created] = await db.insert(categories).values(values).returning({ id: categories.id });
  revalidatePath("/settings/categories");
  revalidatePath("/");
  return { errors: [], id: String(created.id) };
}

export async function updateCategory(input: {
  id: string;
  name: string;
  color: string | null;
}): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { id, name, color } = parsed.data;
  const updated = await db
    .update(categories)
    .set({ name, color: color ?? null })
    .where(eq(categories.id, Number(id)))
    .returning({ id: categories.id });
  if (updated.length === 0) return { errors: [`IDが見つかりません: ${id}`] };
  revalidatePath("/settings/categories");
  revalidatePath("/");
  return { errors: [] };
}

// spec §4.3: 参照レコードが1件でもあれば削除不可。子カテゴリは再帰削除。
async function hasReferences(tx: DbTransaction, categoryId: number): Promise<boolean> {
  const checks = [
    tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.categoryId, categoryId)).limit(1),
    tx.select({ id: budgets.id }).from(budgets).where(eq(budgets.categoryId, categoryId)).limit(1),
    tx
      .select({ id: budgetAlertSettings.id })
      .from(budgetAlertSettings)
      .where(eq(budgetAlertSettings.categoryId, categoryId))
      .limit(1),
    tx
      .select({ id: paceAlertSettings.id })
      .from(paceAlertSettings)
      .where(eq(paceAlertSettings.categoryId, categoryId))
      .limit(1),
    tx.select({ id: paceAlerts.id }).from(paceAlerts).where(eq(paceAlerts.categoryId, categoryId)).limit(1),
    tx.select({ id: budgetAlerts.id }).from(budgetAlerts).where(eq(budgetAlerts.categoryId, categoryId)).limit(1),
    tx
      .select({ id: storeCategoryMappings.id })
      .from(storeCategoryMappings)
      .where(eq(storeCategoryMappings.categoryId, categoryId))
      .limit(1),
  ];
  const results = await Promise.all(checks);
  return results.some((r) => r.length > 0);
}

async function deleteRecursively(tx: DbTransaction, categoryId: number): Promise<string[]> {
  // 子カテゴリを先に再帰削除
  const children = await tx.select({ id: categories.id }).from(categories).where(eq(categories.parentId, categoryId));
  for (const child of children) {
    const childErrors = await deleteRecursively(tx, child.id);
    if (childErrors.length > 0) return childErrors;
  }
  if (await hasReferences(tx, categoryId)) {
    return ["このカテゴリには取引・予算などが紐づいているため削除できません"];
  }
  await tx.delete(categories).where(eq(categories.id, categoryId));
  return [];
}

export async function deleteCategory(input: { id: string }): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const numericId = Number(parsed.data.id);

  let errors: string[] = [];
  await db
    .transaction(async (tx) => {
      const exists = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, numericId)).limit(1);
      if (exists.length === 0) {
        errors = [`IDが見つかりません: ${input.id}`];
        return;
      }
      errors = await deleteRecursively(tx, numericId);
      if (errors.length > 0) throw new Error("__rollback__"); // 参照ありならロールバック
    })
    .catch((e) => {
      if (!(e instanceof Error && e.message === "__rollback__")) throw e;
    });

  if (errors.length > 0) return { errors };
  revalidatePath("/settings/categories");
  revalidatePath("/");
  return { errors: [] };
}
