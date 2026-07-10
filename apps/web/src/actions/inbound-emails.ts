"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { inboundEmails, notifications, storeCategoryMappings, transactions } from "@/db/schema";
import { evaluateAlertsForTransaction, refreshUnclassifiedAlert } from "@/lib/alerts";
import { jstDateInputToDate } from "@/lib/serialize";
import { normalizeStoreName } from "@/lib/store-name";

export type ActionResult = { errors: string[] };

const resolveSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int().positive("金額は1以上で入力してください"),
  storeName: z.string().trim().min(1, "店名を入力してください"),
  date: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/, "日付の形式が不正です"),
});
const idSchema = z.object({ id: z.string().min(1) });

/**
 * 取り込み失敗メールから手動で取引を登録する（外貨建て等でパースできなかったメール向け）。
 * Webhook処理と同じ規則でマッピング自動分類・アラート同期実行を行い、
 * 元メールを processed 化して取引に紐付ける。
 */
export async function resolveFailedInboundEmail(input: {
  id: string;
  amount: number;
  storeName: string;
  date: string;
}): Promise<ActionResult> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { amount, storeName, date } = parsed.data;
  const emailId = Number(parsed.data.id);

  const errors = await db.transaction(async (tx) => {
    // 二重登録防止: failed かつ未紐付けの行のみ対象
    const target = (
      await tx
        .select({ id: inboundEmails.id })
        .from(inboundEmails)
        .where(
          and(
            eq(inboundEmails.id, emailId),
            eq(inboundEmails.status, "failed"),
            isNull(inboundEmails.transactionId),
          ),
        )
        .limit(1)
    )[0];
    if (!target) return [`対象のメールが見つかりません（登録済みの可能性）: ${input.id}`];

    // マッピング照合（Webhookと同一規則: 正規化した店名で一致検索）
    const mapping = (
      await tx
        .select({ categoryId: storeCategoryMappings.categoryId })
        .from(storeCategoryMappings)
        .where(eq(storeCategoryMappings.storeName, normalizeStoreName(storeName)))
        .limit(1)
    )[0];

    const [created] = await tx
      .insert(transactions)
      .values({
        amount,
        // Webhookと同一規則: 保存する店名もNFKC正規化する
        storeName: normalizeStoreName(storeName),
        purchasedAt: jstDateInputToDate(date),
        categoryId: mapping?.categoryId ?? null,
        source: "email",
      })
      .returning({ id: transactions.id });

    await evaluateAlertsForTransaction(tx, created.id);
    await refreshUnclassifiedAlert(tx);

    await tx
      .update(inboundEmails)
      .set({ status: "processed", transactionId: created.id, errorMessage: null })
      .where(eq(inboundEmails.id, emailId));
    await tx
      .delete(notifications)
      .where(
        and(eq(notifications.notifiableType, "InboundEmail"), eq(notifications.notifiableId, emailId)),
      );
    return [] as string[];
  });

  if (errors.length > 0) return { errors };
  revalidatePath("/");
  return { errors: [] };
}

/** 取り込み失敗メールを登録せず無視する（skipped化。行は残す） */
export async function ignoreFailedInboundEmail(input: { id: string }): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const emailId = Number(parsed.data.id);

  const errors = await db.transaction(async (tx) => {
    const updated = await tx
      .update(inboundEmails)
      .set({ status: "skipped" })
      .where(and(eq(inboundEmails.id, emailId), eq(inboundEmails.status, "failed")))
      .returning({ id: inboundEmails.id });
    if (updated.length === 0) return [`対象のメールが見つかりません: ${input.id}`];
    await tx
      .delete(notifications)
      .where(
        and(eq(notifications.notifiableType, "InboundEmail"), eq(notifications.notifiableId, emailId)),
      );
    return [] as string[];
  });

  if (errors.length > 0) return { errors };
  revalidatePath("/");
  return { errors: [] };
}
