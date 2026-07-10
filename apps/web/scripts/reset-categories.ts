/**
 * 1回きりの運用スクリプト: カテゴリ2階層化に伴う旧カテゴリ体系の破棄。
 * 取引を未分類へ戻し、カテゴリ・予算・アラート関連の設定/履歴を全削除する。
 *
 * 実行方法（DATABASE_URL を対象DBに向けて実行）:
 *   npx tsx scripts/reset-categories.ts        # dry-run（件数表示のみ、変更なし）
 *   CONFIRM=1 npx tsx scripts/reset-categories.ts   # 実際にリセットを実行
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  schema,
  budgetAlertSettings,
  budgetAlerts,
  budgets,
  categories,
  notifications,
  paceAlertSettings,
  paceAlerts,
  storeCategoryMappings,
  transactions,
  type DbTransaction,
} from "../src/db/schema";
import { refreshUnclassifiedAlert } from "../src/lib/alerts";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  // Supabase transaction-mode pooler は prepared statements 非対応のため prepare:false 必須。
  const client = postgres(connectionString, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  try {
    await db.transaction(async (tx) => {
      const [
        classifiedTransactionCount,
        alertNotificationCount,
        budgetAlertCount,
        paceAlertCount,
        budgetAlertSettingCount,
        paceAlertSettingCount,
        storeCategoryMappingCount,
        budgetCount,
        categoryCount,
      ] = await Promise.all([
        countRows(tx, transactions, isNotNull(transactions.categoryId)),
        countRows(
          tx,
          notifications,
          inArray(notifications.notifiableType, ["BudgetAlert", "PaceAlert"]),
        ),
        countRows(tx, budgetAlerts),
        countRows(tx, paceAlerts),
        countRows(tx, budgetAlertSettings),
        countRows(tx, paceAlertSettings),
        countRows(tx, storeCategoryMappings),
        countRows(tx, budgets),
        countRows(tx, categories),
      ]);

      console.log("reset-categories: dry-run counts", {
        transactionsToUnclassify: classifiedTransactionCount,
        notificationsToDelete: alertNotificationCount,
        budgetAlerts: budgetAlertCount,
        paceAlerts: paceAlertCount,
        budgetAlertSettings: budgetAlertSettingCount,
        paceAlertSettings: paceAlertSettingCount,
        storeCategoryMappings: storeCategoryMappingCount,
        budgets: budgetCount,
        categories: categoryCount,
      });

      if (process.env.CONFIRM !== "1") {
        console.log(
          "CONFIRM=1 を付けて再実行してください（このままでは何も変更されません）。",
        );
        return;
      }

      await tx.update(transactions).set({ categoryId: null });
      await tx
        .delete(notifications)
        .where(inArray(notifications.notifiableType, ["BudgetAlert", "PaceAlert"]));
      await tx.delete(budgetAlerts);
      await tx.delete(paceAlerts);
      await tx.delete(budgetAlertSettings);
      await tx.delete(paceAlertSettings);
      await tx.delete(storeCategoryMappings);
      await tx.delete(budgets);
      await tx.delete(categories);

      await refreshUnclassifiedAlert(tx);

      console.log("reset-categories: done");
    });
  } finally {
    await client.end();
  }
}

async function countRows(
  tx: DbTransaction,
  table: PgTable,
  where?: SQL,
): Promise<number> {
  const query = tx.select({ c: sql<string>`count(*)` }).from(table);
  const row = where ? await query.where(where) : await query;
  return Number(row[0].c);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
