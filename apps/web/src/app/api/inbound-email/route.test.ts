import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  categories,
  inboundEmails,
  notifications,
  storeCategoryMappings,
  transactions,
  unclassifiedAlerts,
} from "@/db/schema";
import { createTestDb, resetTestDb } from "@/test/db";

// `@/db/client` の `db` を pglite テストDBに差し替える。getter 経由で毎アクセス時に
// 現在のテストDBを返すことで、テストごとに新しいDBへ向けられるようにする。
const holder = vi.hoisted(
  () => ({ current: null as unknown as Awaited<ReturnType<typeof createTestDb>>["db"] }),
);
vi.mock("@/db/client", () => ({
  get db() {
    return holder.current;
  },
}));

const { db: testDb, client, teardown } = await createTestDb();
holder.current = testDb;

// CloudMailin `plain` は charset デコード済みUTF-8。以下は fixtures/*.eml（ISO-2022-JP）を
// CloudMailin がデコードした後に相当する本文（抽出に必要な行のみ）。
const SEVEN_ELEVEN_PLAIN = [
  " ヒロシです　様",
  "",
  " ◎ご利用日：2026/07/08 16:22",
  " ◎ご利用先：セブン－イレブン",
  " ◎ご利用取引：買物",
  " ◎ご利用金額：433 円",
].join("\n");

const BELC_PLAIN = [
  " ◎ご利用日：2026/07/08 23:24",
  " ◎ご利用先：BELC WAKOSHIRAKO",
  " ◎ご利用取引：買物",
  " ◎ご利用金額：1,076 円",
].join("\n");

const TOKEN = "test-inbound-token";

type PayloadOverrides = {
  from?: string;
  subject?: string;
  messageId?: string;
  plain?: string;
};

function payload(over: PayloadOverrides = {}) {
  return {
    headers: {
      from: over.from ?? "三井住友カード <statement@vpass.ne.jp>",
      subject: over.subject ?? "ご利用のお知らせ【三井住友カード】",
      message_id: over.messageId ?? `<${crypto.randomUUID()}@vpass.ne.jp>`,
    },
    envelope: { from: "ds-xxxx@mail401.vpass.ne.jp" },
    plain: over.plain ?? SEVEN_ELEVEN_PLAIN,
  };
}

function request(body: unknown, token: string | null = TOKEN) {
  const url =
    token === null
      ? "http://localhost/api/inbound-email"
      : `http://localhost/api/inbound-email?token=${token}`;
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// 差し替えたDBを参照する route を動的 import する（mock 設定後に読む）。
async function callPost(req: NextRequest) {
  const { POST } = await import("./route");
  return POST(req);
}

beforeEach(async () => {
  await resetTestDb(client);
  process.env.INBOUND_TOKEN = TOKEN;
});

afterEach(() => {
  vi.resetModules();
});

afterAll(async () => {
  await teardown();
});

describe("POST /api/inbound-email", () => {
  it("token 不一致で 401 を返し、DBには何も書かない", async () => {
    const res = await callPost(request(payload(), "wrong-token"));
    expect(res.status).toBe(401);
    const rows = await holder.current.select().from(inboundEmails);
    expect(rows).toHaveLength(0);
  });

  it("token 未指定でも 401", async () => {
    const res = await callPost(request(payload(), null));
    expect(res.status).toBe(401);
  });

  it("対象外メール（三井住友カード以外）は skipped として記録し、取引も通知も作らない", async () => {
    const res = await callPost(
      request(payload({ from: "noreply@example.com", subject: "広告メール" })),
    );
    expect(res.status).toBe(200);

    const inbound = await holder.current.select().from(inboundEmails);
    expect(inbound).toHaveLength(1);
    expect(inbound[0].status).toBe("skipped");

    expect(await holder.current.select().from(transactions)).toHaveLength(0);
    expect(await holder.current.select().from(notifications)).toHaveLength(0);
  });

  it("マッピング無しの正常メールは未分類取引を作成し、未分類アラート通知を作る", async () => {
    const res = await callPost(request(payload({ plain: SEVEN_ELEVEN_PLAIN })));
    expect(res.status).toBe(200);

    const tx = await holder.current.select().from(transactions);
    expect(tx).toHaveLength(1);
    expect(tx[0].amount).toBe(433);
    // parseSmbcEmail は storeName を NFKC 正規化する（計画A src/lib/email-parser.ts）ため、
    // 入力の全角ハイフン（U+FF0D）は ASCII ハイフン（U+002D）になる。
    expect(tx[0].storeName).toBe("セブン-イレブン");
    expect(tx[0].categoryId).toBeNull();
    expect(tx[0].source).toBe("email");

    const inbound = await holder.current.select().from(inboundEmails);
    expect(inbound[0].status).toBe("processed");
    expect(inbound[0].transactionId).toBe(tx[0].id);

    // refreshUnclassifiedAlert が同一トランザクションで走り、未分類通知が作られる
    expect(await holder.current.select().from(unclassifiedAlerts)).toHaveLength(1);
    const notes = await holder.current.select().from(notifications);
    expect(notes.some((n) => n.notifiableType === "UnclassifiedAlert")).toBe(true);
  });

  it("マッピング一致メールは categoryId を確定して取引を作成する", async () => {
    const [cat] = await holder.current
      .insert(categories)
      .values({ name: "食費", kind: "variable" })
      .returning();
    await holder.current
      .insert(storeCategoryMappings)
      .values({ categoryId: cat.id, storeName: "BELC WAKOSHIRAKO" });

    const res = await callPost(request(payload({ plain: BELC_PLAIN })));
    expect(res.status).toBe(200);

    const tx = await holder.current.select().from(transactions);
    expect(tx).toHaveLength(1);
    expect(tx[0].amount).toBe(1076);
    expect(tx[0].storeName).toBe("BELC WAKOSHIRAKO");
    expect(tx[0].categoryId).toBe(cat.id);
  });

  it("同一 message_id の再送は冪等（2回目は取引を増やさず 200）", async () => {
    const body = payload({ messageId: "<dup-1@vpass.ne.jp>", plain: BELC_PLAIN });
    const first = await callPost(request(body));
    expect(first.status).toBe(200);
    const second = await callPost(request(body));
    expect(second.status).toBe(200);

    expect(await holder.current.select().from(transactions)).toHaveLength(1);
    expect(await holder.current.select().from(inboundEmails)).toHaveLength(1);
  });

  it("パース失敗（項目欠落）は failed として記録し InboundEmail 通知を作る（取引は作らない・200）", async () => {
    const broken = " ◎ご利用日：2026/07/08 16:22\n ◎ご利用取引：買物"; // 店舗名・金額なし
    const res = await callPost(request(payload({ plain: broken })));
    expect(res.status).toBe(200);

    const inbound = await holder.current.select().from(inboundEmails);
    expect(inbound[0].status).toBe("failed");
    expect(inbound[0].errorMessage).toBeTruthy();

    expect(await holder.current.select().from(transactions)).toHaveLength(0);
    const notes = await holder.current.select().from(notifications);
    expect(notes).toHaveLength(1);
    expect(notes[0].notifiableType).toBe("InboundEmail");
    expect(notes[0].notifiableId).toBe(inbound[0].id);
  });
});
