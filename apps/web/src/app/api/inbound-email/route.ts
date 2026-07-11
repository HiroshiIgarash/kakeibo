import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  inboundEmails,
  notifications,
  storeCategoryMappings,
  transactions,
} from "@/db/schema";
import { parseSmbcEmailItems } from "@/lib/email-parser";
import {
  evaluateAlertsForTransaction,
  refreshUnclassifiedAlert,
} from "@/lib/alerts";

// postgres-js を使うため Node ランタイムで実行する（Edge 非対応）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CloudMailin Normalized JSON format のうち、本実装で参照するフィールドのみ型定義する。
// from / subject / message_id はトップレベルではなく headers 配下に入る（spec §6.1）。
type CloudMailinPayload = {
  headers?: {
    from?: string;
    subject?: string;
    message_id?: string;
  };
  envelope?: {
    from?: string;
  };
  plain?: string;
};

// CloudMailin は 2xx を成功とみなす。パース失敗・対象外も「受信は成功」として 200 を返し、
// 再送ループ（4xx/5xx で発生）を避ける（spec §6 手順7）。
function ok(): Response {
  return new Response("ok", { status: 200 });
}

export async function POST(req: NextRequest): Promise<Response> {
  // 1. URLトークン検証(不一致・未指定は 401)。spec §6 手順2 / §7
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.INBOUND_TOKEN) {
    return new Response("unauthorized", { status: 401 });
  }

  // 2. CloudMailin Normalized JSON をパース
  const payload = (await req.json()) as CloudMailinPayload;
  const from = payload.headers?.from ?? "";
  const subject = payload.headers?.subject ?? null;
  const messageId = payload.headers?.message_id ?? "";
  // 一次ソースは plain（charset デコード済みUTF-8）。raw_body にもこれを保存する。
  const plain = payload.plain ?? "";

  // message_id は冪等キー(not null unique)。CloudMailin は常に付与するが、欠落時は
  // claim できないため処理せず 200 を返す。
  if (!messageId) {
    return ok();
  }

  // 3. message_id で inbound_emails を claim(onConflictDoNothing で冪等化)。spec §6 手順3
  //    SELECT→INSERT の二段階は race するため、unique 制約違反そのものをガードに使う。
  const claimed = await db
    .insert(inboundEmails)
    .values({
      messageId,
      from,
      subject,
      rawBody: plain,
      status: "pending",
    })
    .onConflictDoNothing({ target: inboundEmails.messageId })
    .returning({ id: inboundEmails.id });

  // 0件 = 既に同一 message_id が存在(再送・重複配信)→ 以降を行わず 200
  if (claimed.length === 0) {
    return ok();
  }
  const inboundEmailId = claimed[0].id;

  // 4. パース(対象メール判定はパーサー内部。spec §6.1)。
  //    「ご利用明細のお知らせ」は1通に複数明細があり得るため items で受ける
  const parsed = parseSmbcEmailItems({ from, subject: subject ?? "", plain });

  if (!parsed.ok) {
    if (parsed.reason === "not_target") {
      // 三井住友カード以外の転送メール・Gmail転送確認メール等 → skipped(通知は作らない)
      await db
        .update(inboundEmails)
        .set({ status: "skipped" })
        .where(eq(inboundEmails.id, inboundEmailId));
      return ok();
    }
    // parse_error → failed + アプリ内通知(InboundEmail)。spec §6 手順7
    await db.transaction(async (tx) => {
      await tx
        .update(inboundEmails)
        .set({
          status: "failed",
          errorMessage: parsed.error ?? "parse error",
        })
        .where(eq(inboundEmails.id, inboundEmailId));
      await tx.insert(notifications).values({
        notifiableType: "InboundEmail",
        notifiableId: inboundEmailId,
      });
    });
    return ok();
  }

  // 5-6. 全明細を取引化（店名マッピング照合 → insert → アラート判定）+
  //      inbound_emails更新を単一DBトランザクションで(spec §6 手順6 / §5.5)
  await db.transaction(async (tx) => {
    let firstTransactionId: number | null = null;
    for (const item of parsed.items) {
      // 店舗名はパーサー側で NFKC 正規化済み。store_category_mappings と照合(spec §6.1)
      const mapping = await tx
        .select({ categoryId: storeCategoryMappings.categoryId })
        .from(storeCategoryMappings)
        .where(eq(storeCategoryMappings.storeName, item.storeName))
        .limit(1);

      const inserted = await tx
        .insert(transactions)
        .values({
          amount: item.amount,
          storeName: item.storeName,
          purchasedAt: item.purchasedAt,
          categoryId: mapping[0]?.categoryId ?? null,
          source: "email",
        })
        .returning({ id: transactions.id });
      firstTransactionId ??= inserted[0].id;

      // 予算アラート・ペースアラート(category が null なら内部で no-op)
      await evaluateAlertsForTransaction(tx, inserted[0].id);
    }
    // 未分類アラートの再計算(spec §5.6)は全明細の insert 後に1回
    await refreshUnclassifiedAlert(tx);

    // 複数明細の場合は先頭の取引に紐付ける（inbound_emails は取引と1対1のため）
    await tx
      .update(inboundEmails)
      .set({ status: "processed", transactionId: firstTransactionId })
      .where(eq(inboundEmails.id, inboundEmailId));
  });

  return ok();
}
