"use server";

import { z } from "zod";
import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { budgetAlertSettings, paceAlertSettings } from "@/db/schema";
import { getCategoryRole } from "@/lib/category-tree";

export type ActionResult = { errors: string[] };

// Rails BudgetAlertSetting: threshold/threshold2 は 1〜200（greater_than: 0, less_than_or_equal_to: 200）
const budgetSchema = z
  .object({
    categoryId: z
      .union([z.string(), z.null()])
      .transform((v) => (v == null || v === "" ? null : Number(v))),
    threshold: z
      .number()
      .int()
      .gt(0, "閾値は1以上で入力してください")
      .lte(200, "閾値は200以下で入力してください"),
    threshold2: z.union([
      z.number().int().gt(0, "第2閾値は1以上で入力してください").lte(200, "第2閾値は200以下で入力してください"),
      z.null(),
    ]),
    isActive: z.boolean(),
  })
  .refine((d) => d.threshold2 == null || d.threshold2 > d.threshold, {
    message: "第2閾値は第1閾値より大きい値にしてください",
    path: ["threshold2"],
  });

// Rails PaceAlertSetting: threshold は 101〜500、active_from_day は 1〜28
const paceSchema = z.object({
  categoryId: z.string().min(1, "カテゴリを選択してください"),
  threshold: z
    .number()
    .int()
    .gt(100, "ペース閾値は101以上で入力してください")
    .lte(500, "ペース閾値は500以下で入力してください"),
  activeFromDay: z
    .number()
    .int()
    .gt(0, "開始日は1以上で入力してください")
    .lte(28, "開始日は28以下で入力してください"),
  isActive: z.boolean(),
});

export async function upsertBudgetAlertSetting(input: {
  categoryId: string | null;
  threshold: number;
  threshold2: number | null;
  isActive: boolean;
}): Promise<ActionResult> {
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { categoryId, threshold, threshold2, isActive } = parsed.data;

  if (categoryId != null) {
    const role = await getCategoryRole(db, categoryId);
    if (role == null) return { errors: ["カテゴリが見つかりません"] };
    if (role !== "parent") return { errors: ["親カテゴリを指定してください"] };
  }

  // find_or_initialize_by(category_id) の踏襲。category_id が null の場合は「全体」設定として扱う。
  const whereCat =
    categoryId == null ? isNull(budgetAlertSettings.categoryId) : eq(budgetAlertSettings.categoryId, categoryId);
  const existing = await db.select({ id: budgetAlertSettings.id }).from(budgetAlertSettings).where(whereCat).limit(1);
  if (existing.length > 0) {
    await db
      .update(budgetAlertSettings)
      .set({ threshold, threshold2, isActive })
      .where(eq(budgetAlertSettings.id, existing[0].id));
  } else {
    await db.insert(budgetAlertSettings).values({ categoryId, threshold, threshold2, isActive });
  }
  revalidatePath("/settings/alerts");
  revalidatePath("/");
  return { errors: [] };
}

export async function upsertPaceAlertSetting(input: {
  categoryId: string;
  threshold: number;
  activeFromDay: number;
  isActive: boolean;
}): Promise<ActionResult> {
  const parsed = paceSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { categoryId, threshold, activeFromDay, isActive } = parsed.data;
  const numericCat = Number(categoryId);

  const role = await getCategoryRole(db, numericCat);
  if (role == null) return { errors: ["カテゴリが見つかりません"] };
  if (role !== "parent") return { errors: ["親カテゴリを指定してください"] };

  const existing = await db
    .select({ id: paceAlertSettings.id })
    .from(paceAlertSettings)
    .where(eq(paceAlertSettings.categoryId, numericCat))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(paceAlertSettings)
      .set({ threshold, activeFromDay, isActive })
      .where(eq(paceAlertSettings.id, existing[0].id));
  } else {
    await db.insert(paceAlertSettings).values({ categoryId: numericCat, threshold, activeFromDay, isActive });
  }
  revalidatePath("/settings/alerts");
  revalidatePath("/");
  return { errors: [] };
}
