"use server";

import { z } from "zod";
import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";

export type ActionResult = { errors: string[] };

const idSchema = z.object({ id: z.string().min(1) });

export async function markNotificationAsRead(input: { id: string }): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };

  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, Number(parsed.data.id)))
    .returning({ id: notifications.id });
  if (updated.length === 0) return { errors: [`Notification not found: ${input.id}`] };

  revalidatePath("/");
  return { errors: [] };
}

export async function markAllNotificationsAsRead(): Promise<ActionResult> {
  await db.update(notifications).set({ readAt: new Date() }).where(isNull(notifications.readAt));

  revalidatePath("/");
  return { errors: [] };
}
