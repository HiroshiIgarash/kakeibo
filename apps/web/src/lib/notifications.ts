import { desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/schema";
import { notifications, budgetAlerts, paceAlerts, unclassifiedAlerts, inboundEmails, categories } from "@/db/schema";

export type Notifiable =
  | { __typename: "BudgetAlert"; category: { name: string }; threshold: number; usagePercent: number }
  | { __typename: "PaceAlert"; category: { name: string }; month: string }
  | { __typename: "UnclassifiedAlert"; count: number }
  | { __typename: "InboundEmail"; subject: string | null; from: string; errorMessage: string | null };

export type NotificationView = { id: string; notifiable: Notifiable };

/**
 * notifications はポリモーフィック（notifiable_type + notifiable_id）なので、
 * 1) notifications を絞り込み、2) type ごとに対応テーブルへ IN 句で2次クエリを投げて
 * notifiable_id をキーに Map 化し、3) 元の順序を保ったまま合成する。
 * N+1（notification 行ごとにクエリ）を避けるため、テーブルあたり1クエリに抑える。
 */
export async function loadUnreadNotifications(db: Db, limit: number): Promise<NotificationView[]> {
  const notes = await db
    .select({ id: notifications.id, type: notifications.notifiableType, notifiableId: notifications.notifiableId })
    .from(notifications)
    .where(isNull(notifications.readAt))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
  if (notes.length === 0) return [];

  const idsByType = new Map<string, number[]>();
  for (const n of notes) {
    const arr = idsByType.get(n.type) ?? [];
    arr.push(n.notifiableId);
    idsByType.set(n.type, arr);
  }

  const budgetMap = new Map<number, Notifiable>();
  const paceMap = new Map<number, Notifiable>();
  const unclassifiedMap = new Map<number, Notifiable>();
  const inboundMap = new Map<number, Notifiable>();

  const budgetIds = idsByType.get("BudgetAlert");
  if (budgetIds?.length) {
    const rows = await db
      .select({
        id: budgetAlerts.id,
        threshold: budgetAlerts.threshold,
        usagePercent: budgetAlerts.usagePercent,
        catName: categories.name,
      })
      .from(budgetAlerts)
      .innerJoin(categories, eq(budgetAlerts.categoryId, categories.id))
      .where(inArray(budgetAlerts.id, budgetIds));
    for (const r of rows) {
      budgetMap.set(r.id, {
        __typename: "BudgetAlert",
        category: { name: r.catName },
        threshold: r.threshold,
        usagePercent: r.usagePercent,
      });
    }
  }

  const paceIds = idsByType.get("PaceAlert");
  if (paceIds?.length) {
    const rows = await db
      .select({ id: paceAlerts.id, month: paceAlerts.month, catName: categories.name })
      .from(paceAlerts)
      .innerJoin(categories, eq(paceAlerts.categoryId, categories.id))
      .where(inArray(paceAlerts.id, paceIds));
    for (const r of rows) {
      paceMap.set(r.id, { __typename: "PaceAlert", category: { name: r.catName }, month: r.month });
    }
  }

  const unclassifiedIds = idsByType.get("UnclassifiedAlert");
  if (unclassifiedIds?.length) {
    const rows = await db
      .select({ id: unclassifiedAlerts.id, count: unclassifiedAlerts.count })
      .from(unclassifiedAlerts)
      .where(inArray(unclassifiedAlerts.id, unclassifiedIds));
    for (const r of rows) unclassifiedMap.set(r.id, { __typename: "UnclassifiedAlert", count: r.count });
  }

  const inboundIds = idsByType.get("InboundEmail");
  if (inboundIds?.length) {
    const rows = await db
      .select({
        id: inboundEmails.id,
        subject: inboundEmails.subject,
        from: inboundEmails.from,
        errorMessage: inboundEmails.errorMessage,
      })
      .from(inboundEmails)
      .where(inArray(inboundEmails.id, inboundIds));
    for (const r of rows) {
      inboundMap.set(r.id, {
        __typename: "InboundEmail",
        subject: r.subject,
        from: r.from,
        errorMessage: r.errorMessage,
      });
    }
  }

  const pick = (type: string, id: number): Notifiable | null => {
    switch (type) {
      case "BudgetAlert":
        return budgetMap.get(id) ?? null;
      case "PaceAlert":
        return paceMap.get(id) ?? null;
      case "UnclassifiedAlert":
        return unclassifiedMap.get(id) ?? null;
      case "InboundEmail":
        return inboundMap.get(id) ?? null;
      default:
        return null;
    }
  };

  // 元の created_at 降順を保ちつつ、対応レコードが消えている(orphan)通知は除外する
  return notes.flatMap((n) => {
    const notifiable = pick(n.type, n.notifiableId);
    return notifiable ? [{ id: String(n.id), notifiable }] : [];
  });
}
