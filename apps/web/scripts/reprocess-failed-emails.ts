/**
 * 1回きりの運用スクリプト: 取り込み失敗メールの再パース・再取り込み。
 * パーサー改善（例: JPY 表記対応）後に、failed のまま残っているメールを
 * Webhook（src/app/api/inbound-email/route.ts）と同一規則で取引化する。
 *
 * 実行方法（DATABASE_URL を対象DBに向けて実行）:
 *   npx tsx scripts/reprocess-failed-emails.ts        # dry-run（パース結果表示のみ、変更なし）
 *   CONFIRM=1 npx tsx scripts/reprocess-failed-emails.ts   # 実際に取り込みを実行
 *
 * 処理内容（1件ごと、Webhook の手順5-6 + 解決アクションの通知後始末と同一）:
 *  - parseSmbcEmail で raw_body を再パース。失敗するものは failed のまま残す
 *  - 店名を NFKC 正規化して store_category_mappings と照合
 *  - 取引 insert + アラート同期判定 + inbound_emails の processed 化 +
 *    紐づく InboundEmail 通知の削除を単一トランザクションで実行
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull } from "drizzle-orm";
import {
  schema,
  inboundEmails,
  notifications,
  storeCategoryMappings,
  transactions,
} from "../src/db/schema";
import { parseSmbcEmail } from "../src/lib/email-parser";
import { evaluateAlertsForTransaction, refreshUnclassifiedAlert } from "../src/lib/alerts";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL を設定してください");
  const confirm = process.env.CONFIRM === "1";

  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema });

  try {
    const failed = await db
      .select()
      .from(inboundEmails)
      .where(and(eq(inboundEmails.status, "failed"), isNull(inboundEmails.transactionId)))
      .orderBy(inboundEmails.id);

    console.log(`failed メール: ${failed.length}件`);
    let reprocessed = 0;
    let stillFailed = 0;

    for (const row of failed) {
      const parsed = parseSmbcEmail({
        from: row.from,
        subject: row.subject ?? "",
        plain: row.rawBody ?? "",
      });

      if (!parsed.ok) {
        stillFailed++;
        console.log(
          `- id=${row.id} 再パース失敗のまま (${parsed.reason}: ${parsed.error ?? "-"}) → 変更なし`,
        );
        continue;
      }

      console.log(
        `- id=${row.id} パース成功: ¥${parsed.amount.toLocaleString()} / ${parsed.storeName} / ${parsed.purchasedAt.toISOString()}`,
      );

      if (!confirm) {
        reprocessed++;
        continue;
      }

      await db.transaction(async (tx) => {
        // Webhook 手順5: 正規化店名でマッピング照合（parseSmbcEmail の storeName は NFKC 済み）
        const mapping = (
          await tx
            .select({ categoryId: storeCategoryMappings.categoryId })
            .from(storeCategoryMappings)
            .where(eq(storeCategoryMappings.storeName, parsed.storeName))
            .limit(1)
        )[0];

        // Webhook 手順6: 取引 insert + アラート判定 + processed 化を単一トランザクションで
        const [created] = await tx
          .insert(transactions)
          .values({
            amount: parsed.amount,
            storeName: parsed.storeName,
            purchasedAt: parsed.purchasedAt,
            categoryId: mapping?.categoryId ?? null,
            source: "email",
          })
          .returning({ id: transactions.id });

        await evaluateAlertsForTransaction(tx, created.id);
        await refreshUnclassifiedAlert(tx);

        await tx
          .update(inboundEmails)
          .set({ status: "processed", transactionId: created.id, errorMessage: null })
          .where(eq(inboundEmails.id, row.id));
        // 失敗時に作られたアプリ内通知を消す（解決アクションと同じ後始末）
        await tx
          .delete(notifications)
          .where(
            and(
              eq(notifications.notifiableType, "InboundEmail"),
              eq(notifications.notifiableId, row.id),
            ),
          );
      });
      reprocessed++;
      console.log(`  → 取引化して processed に更新`);
    }

    console.log(
      `${confirm ? "実行結果" : "dry-run 結果"}: 取り込み${confirm ? "済み" : "可能"} ${reprocessed}件 / 失敗のまま ${stillFailed}件`,
    );
    if (!confirm) console.log("実行するには CONFIRM=1 を付けて再実行してください");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
