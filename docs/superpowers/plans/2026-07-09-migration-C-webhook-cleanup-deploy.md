# [Migration C: メールWebhook・掃除・デプロイ] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** spec `docs/superpowers/specs/2026-07-09-rails-to-nextjs-migration-design.md` の実装フェーズ **5（メールWebhook）・7（掃除）・8（デプロイ）** を完了する。すなわち (1) CloudMailin からのメール受信を取引へ自動記録する `/api/inbound-email` Route Handler を実装し、(2) GraphQL/Apollo/codegen・メール通知画面・`apps/api`（Rails）を丸ごと削除し、(3) Vercel + Supabase + CloudMailin + Gmail の本番セットアップ手順書を用意する。

**Architecture:** Next.js フルスタック（App Router）。Webhook は Node ランタイムの Route Handler で、`db`（Drizzle over Supabase pooler）を用い「claim（冪等化）→ パース → 取引insert + アラート判定 + inbound_emails更新」を単一DBトランザクションで実行する。掃除は「先に画面差し替え（フェーズ4）が完了している」前提で GraphQL 基盤を物理削除する。デプロイはユーザーが手で実行するチェックリスト。

**Tech Stack:** TypeScript, Next.js 16 (App Router, Route Handler), Drizzle ORM, postgres-js, Vitest, `@electric-sql/pglite`（integration test）, Supabase PostgreSQL, CloudMailin, Vercel。

## Global Constraints

- **spec が唯一の正**。数式・条件分岐・ステータス遷移は spec から変更しない。迷ったら spec の該当節に従う。
- **前提インターフェース（計画A提供・再定義禁止）**。以下を import して消費するだけ。シグネチャ・戻り値を作り直さない。
  - `@/db/client`: `export const db`（Drizzle クライアント）
  - `@/db/schema`: `inboundEmails`, `transactions`, `storeCategoryMappings`, `notifications`, `categories`, `budgets` ほか（spec §4.2）、および `DbTransaction` 型
  - `@/lib/email-parser`: `parseSmbcEmail({ from, subject, plain }) => { ok: true; amount: number; storeName: string; purchasedAt: Date } | { ok: false; reason: 'not_target' | 'parse_error'; error?: string }`。**対象メール判定（三井住友カード判定）はパーサー内部**にあり、対象外は `reason: 'not_target'` で返る（spec §6.1）。
  - `@/lib/alerts`: `evaluateAlertsForTransaction(tx: DbTransaction, transactionId: number): Promise<void>`（予算＋ペースアラート判定。category が null の取引では no-op）, `refreshUnclassifiedAlert(tx: DbTransaction): Promise<void>`（未分類アラートの再計算）
  - `@/test/db`: pglite ベースのテスト基盤（計画A提供）。**本計画のテストは `createTestDb()`（`=> Promise<{ db, teardown }>`、スキーマ適用済みの空DBを返す）を仮定して記述している。計画Aの実際の export 名・戻り値が異なる場合は import 行のみをそれに合わせて調整すること**（テスト本体のロジックは変えない）。
- **依存追加は原則計画Aの担当（zod のみ計画B Task 2 が追加）**。本計画（掃除タスク）では GraphQL 関連依存の **削除のみ** 行い、`drizzle-orm` / `postgres` / `vitest` / `@electric-sql/pglite` / `zod` などの追加は行わない。
- **フェーズ順序の前提**: 掃除（Task 5〜7）は **フェーズ4（Server Actions + 画面差し替え = 計画B）が完了している**ことを前提とする。各削除タスクの冒頭で「削除対象以外に GraphQL/Apollo/gql への live import が残っていないこと」を grep で確認し、残っていれば中断する（フェーズ4未完のサイン）。
- **スコープ外（他計画の担当なので触らない）**:
  - `proxy.ts`（Next.js 16 で `middleware.ts` から改称。計画B実装）/ `/login`（認証 = フェーズ6）。`/api/inbound-email` はトークン検証のみで cookie 認証対象外（spec §7）。proxy 側の除外設定はフェーズ6担当が行う。
  - `notification-list.tsx` の `'InboundEmail'` 分岐追加（spec §8.1、フェーズ4 = 計画B の画面担当）。本計画の Webhook が `notifiable_type='InboundEmail'` の通知を新規に作るため、計画B側で §8.1 の分岐追加が必要になる旨だけ申し送る。
- Route Handler は Node ランタイム（`export const runtime = "nodejs"`）。postgres-js は Edge 非対応。
- 作業ブランチは main/development から切る。main への直接コミットはしない。
- 各コミットの末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` を付ける。

---

## Task 1: メール受信 Webhook `/api/inbound-email` Route Handler

spec §6 全体・§6.1・§5.3〜§5.6・§7 の該当部分。CloudMailin Normalized JSON を受け取り、冪等化 → パース → 取引insert + アラート判定 + inbound_emails更新を行う。

**Files:**
- `apps/web/src/app/api/inbound-email/route.ts`（新規）
- `apps/web/src/app/api/inbound-email/route.test.ts`（新規、pglite integration test）

**Interfaces:**
- Consumes: `@/db/client#db`, `@/db/schema#{inboundEmails, transactions, storeCategoryMappings, notifications, categories}`, `@/db/schema#DbTransaction`, `@/lib/email-parser#parseSmbcEmail`, `@/lib/alerts#{evaluateAlertsForTransaction, refreshUnclassifiedAlert}`, `@/test/db#createTestDb`
- Produces: `POST(req: NextRequest): Promise<Response>`（外部＝CloudMailin から呼ばれる。他コードからは import されない）

### 実装ステップ

- [ ] テスト先行: 下記の全文で `apps/web/src/app/api/inbound-email/route.test.ts` を作成する。

```ts
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  categories,
  inboundEmails,
  notifications,
  storeCategoryMappings,
  transactions,
  unclassifiedAlerts,
} from "@/db/schema";
import { createTestDb } from "@/test/db";

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

let teardown: () => Promise<void>;

beforeEach(async () => {
  const t = await createTestDb();
  holder.current = t.db;
  teardown = t.teardown;
  process.env.INBOUND_TOKEN = TOKEN;
});

afterEach(async () => {
  await teardown();
  vi.resetModules();
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
```

- [ ] 失敗確認: `cd apps/web && pnpm vitest run src/app/api/inbound-email/route.test.ts` を実行し、`route.ts` 未実装で全ケースが失敗（Red）することを確認する。
- [ ] 実装: 下記の全文で `apps/web/src/app/api/inbound-email/route.ts` を作成する。

```ts
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  inboundEmails,
  notifications,
  storeCategoryMappings,
  transactions,
} from "@/db/schema";
import { parseSmbcEmail } from "@/lib/email-parser";
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
  // 1. URLトークン検証（不一致・未指定は 401）。spec §6 手順2 / §7
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

  // message_id は冪等キー（not null unique）。CloudMailin は常に付与するが、欠落時は
  // claim できないため処理せず 200 を返す。
  if (!messageId) {
    return ok();
  }

  // 3. message_id で inbound_emails を claim（onConflictDoNothing で冪等化）。spec §6 手順3
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

  // 0件 = 既に同一 message_id が存在（再送・重複配信）→ 以降を行わず 200
  if (claimed.length === 0) {
    return ok();
  }
  const inboundEmailId = claimed[0].id;

  // 4. パース（対象メール判定はパーサー内部。spec §6.1）
  const parsed = parseSmbcEmail({ from, subject: subject ?? "", plain });

  if (!parsed.ok) {
    if (parsed.reason === "not_target") {
      // 三井住友カード以外の転送メール・Gmail転送確認メール等 → skipped（通知は作らない）
      await db
        .update(inboundEmails)
        .set({ status: "skipped" })
        .where(eq(inboundEmails.id, inboundEmailId));
      return ok();
    }
    // parse_error → failed + アプリ内通知（InboundEmail）。spec §6 手順7
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

  // 5. 店舗名を NFKC 正規化して store_category_mappings と照合（spec §6.1）
  const normalizedStore = parsed.storeName.normalize("NFKC");
  const mapping = await db
    .select({ categoryId: storeCategoryMappings.categoryId })
    .from(storeCategoryMappings)
    .where(eq(storeCategoryMappings.storeName, normalizedStore))
    .limit(1);
  const categoryId = mapping[0]?.categoryId ?? null;

  // 6. 取引insert + アラート判定 + inbound_emails更新を単一DBトランザクションで（spec §6 手順6 / §5.5）
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(transactions)
      .values({
        amount: parsed.amount,
        storeName: parsed.storeName,
        purchasedAt: parsed.purchasedAt,
        categoryId,
        source: "email",
      })
      .returning({ id: transactions.id });
    const transactionId = inserted[0].id;

    // 予算アラート・ペースアラート（category が null なら内部で no-op）
    await evaluateAlertsForTransaction(tx, transactionId);
    // 未分類アラートの再計算（spec §5.6）
    await refreshUnclassifiedAlert(tx);

    await tx
      .update(inboundEmails)
      .set({ status: "processed", transactionId })
      .where(eq(inboundEmails.id, inboundEmailId));
  });

  return ok();
}
```

- [ ] パス確認: `cd apps/web && pnpm vitest run src/app/api/inbound-email/route.test.ts` を実行し、全ケース Green を確認する。
- [ ] 型確認: `cd apps/web && pnpm exec tsc --noEmit` でエラーが無いことを確認する。
- [ ] commit: `git add apps/web/src/app/api/inbound-email && git commit -m "feat(migration): add /api/inbound-email webhook for CloudMailin"`

---

## Task 2: Webhook 手動確認（実DB相当スモーク）

pglite 以外での挙動確認。ローカルで Route を叩き、200/401 と inbound_emails の記録を目視する。

**Files:** なし（動作確認のみ）

- [ ] `cd apps/web && INBOUND_TOKEN=localtoken pnpm dev` で起動する（`DATABASE_URL` はローカルの検証用 DB か Supabase の開発用を指す前提。計画A/デプロイ側の設定に依存）。
- [ ] 対象メールを1通投入して 200 と取引作成を確認する:

```bash
curl -i -X POST "http://localhost:3000/api/inbound-email?token=localtoken" \
  -H "content-type: application/json" \
  -d '{"headers":{"from":"三井住友カード <statement@vpass.ne.jp>","subject":"ご利用のお知らせ【三井住友カード】","message_id":"<smoke-1@vpass.ne.jp>"},"envelope":{"from":"x@vpass.ne.jp"},"plain":" ◎ご利用日：2026/07/09 12:00\n ◎ご利用先：スモークテスト店\n ◎ご利用金額：100 円"}'
```

- [ ] 同じ body を再投入し、取引が増えず 200 が返る（冪等）ことを確認する。
- [ ] token を変えて 401 が返ることを確認する。
- [ ] 確認できたら dev サーバを停止する（コミット不要）。

---

## Task 3: `apps/api`（Rails）削除前の live 参照確認

削除の安全確認。実行前に「`apps/web` 側に GraphQL/Apollo/gql への live import が、これから削除する基盤ファイル以外に残っていない」ことを保証する。残っていればフェーズ4（計画B）が未完なので中断する。

**Files:** なし（検査のみ）

- [ ] フェーズ4完了チェック（削除予定ファイルを除いた live 参照の検出）:

```bash
cd apps/web
grep -rn "@apollo/client\|@apollo/client-integration-nextjs\|@/gql\|graphql(" src \
  | grep -v "src/gql/" \
  | grep -v "src/lib/apollo-client.ts" \
  | grep -v "src/components/providers.tsx"
```

- [ ] 上記の出力が **空** であることを確認する（`src/components/mail-notification-content.tsx` が出る場合は Task 6 で丸ごと削除するので許容。それ以外の live コンポーネント／ページが出たらフェーズ4未完 → 中断して計画B担当へ差し戻す）。
- [ ] 出力が空（または mail-notification-content のみ）であることを確認できたら次タスクへ進む。

---

## Task 4: GraphQL / Apollo / codegen 基盤の削除

spec §2.2・§8。GraphQL クライアント層（Apollo・codegen・生成物・Provider・設定）を物理削除する。

**Files（削除）:**
- `apps/web/src/gql/gql.ts`
- `apps/web/src/gql/graphql.ts`
- `apps/web/src/gql/index.ts`
- `apps/web/src/gql/fragment-masking.ts`
- `apps/web/src/lib/apollo-client.ts`
- `apps/web/src/lib/config.ts`（`GRAPHQL_URL` のみを export。消費者は apollo-client.ts / providers.tsx のみで両方削除するため不要）
- `apps/web/src/components/providers.tsx`
- `apps/web/codegen.ts`

**Files（編集）:**
- `apps/web/src/app/layout.tsx`
- `apps/web/package.json`

- [ ] ファイル削除:

```bash
cd apps/web
git rm src/gql/gql.ts src/gql/graphql.ts src/gql/index.ts src/gql/fragment-masking.ts \
       src/lib/apollo-client.ts src/lib/config.ts src/components/providers.tsx codegen.ts
```

- [ ] `apps/web/src/app/layout.tsx` を編集する。3行目 `import { Providers } from "@/components/providers";` を削除し、`<Providers>...</Providers>` ラッパーをフラグメントに置き換える。差分は以下。

置換前:
```tsx
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
```
置換後:
```tsx
import { AppShell } from "@/components/app-shell";
```

置換前:
```tsx
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          {children}
          {/* BottomNav（固定）の高さ分のスペーサー */}
          <div aria-hidden style={{ height: "calc(56px + env(safe-area-inset-bottom))" }} />
          <AppShell />
        </Providers>
      </body>
```
置換後:
```tsx
      <body className="min-h-full flex flex-col font-sans">
        {children}
        {/* BottomNav（固定）の高さ分のスペーサー */}
        <div aria-hidden style={{ height: "calc(56px + env(safe-area-inset-bottom))" }} />
        <AppShell />
      </body>
```

- [ ] `apps/web/package.json` を編集する。
  - `dependencies` から削除: `@apollo/client`, `@apollo/client-integration-nextjs`, `graphql`
  - `devDependencies` から削除: `@graphql-codegen/cli`, `@graphql-codegen/client-preset`, `@parcel/watcher`
  - `scripts` を修正: `"dev": "next dev & graphql-codegen --config codegen.ts --watch"` → `"dev": "next dev"`。`"codegen": "graphql-codegen --config codegen.ts"` の行を削除。
- [ ] 依存の再解決: `cd /Users/hiroshi/Desktop/work/rails/kakeibo && pnpm install`（`pnpm-lock.yaml` が更新される）。
- [ ] ビルド確認: `cd apps/web && pnpm exec tsc --noEmit && pnpm build`。GraphQL 参照が残っていればここで失敗する（→ Task 3 に戻る）。
- [ ] commit: `git add -A && git commit -m "chore(migration): remove Apollo/codegen/GraphQL client layer"`

---

## Task 5: メール通知画面・関連フックの削除

spec §2.2・§8（`/settings/mail` 廃止）。メール送信機能廃止に伴い、メール通知設定画面とそれ専用のフックを削除する。`toggle-switch.tsx` は `alert-settings-content.tsx` と共有のため **残す**。

**Files（削除）:**
- `apps/web/src/app/settings/mail/page.tsx`（`settings/mail` ディレクトリごと）
- `apps/web/src/components/mail-notification-content.tsx`
- `apps/web/src/hooks/use-immediate-toggle.ts`（消費者は mail-notification-content のみ）

**Files（確認のみ・原則編集しない）:**
- `apps/web/src/app/settings/page.tsx`（「メール通知」ナビ項目と `Mail` アイコン import の削除は **計画B T13d が唯一の所有者**。クロスレビュー指摘 M1: 本タスクでは削除済みであることの確認のみ行い、二重編集はしない）

**Files（削除しない・確認済み）:**
- `apps/web/src/components/ui/toggle-switch.tsx`（`alert-settings-content.tsx` も使用）

- [ ] 削除前に共有フック／コンポーネントの消費者を再確認する:

```bash
cd apps/web
grep -rln "use-immediate-toggle\|useImmediateToggle" src   # → mail-notification-content のみのはず
grep -rln "toggle-switch\|ToggleSwitch" src                 # → alert-settings-content と mail の2つ（alerts が残るので toggle-switch は保持）
```

- [ ] ファイル削除（これらは git 未追跡の可能性があるため `rm` で消し、後段の `git add -A` で反映する）:

```bash
cd apps/web
rm -rf src/app/settings/mail \
       src/components/mail-notification-content.tsx \
       src/hooks/use-immediate-toggle.ts
```

- [ ] `apps/web/src/app/settings/page.tsx` の「メール通知」削除が済んでいるか確認する（削除自体は計画B T13d の担当。M1: ここで重複編集はしない）:

```bash
cd apps/web
grep -n "メール通知\|settings/mail\|^import.*Mail" src/app/settings/page.tsx
```

- [ ] 上記の出力が **空** であることを確認する（B T13d 済みなら no-op）。もし何かヒットした場合は B T13d が未実施ということなのでフェーズ4未完のサイン。本来は B へ差し戻すべきだが、掃除フェーズを止めないためやむを得ず本タスクで対応する場合のみ、以下を適用する:
  - 1行目の import から `Mail` を除く: `import { Bell, Tag, GitBranch, Mail, ChevronRight } from "lucide-react";` → `import { Bell, Tag, GitBranch, ChevronRight } from "lucide-react";`
  - `SETTINGS_SECTIONS` 配列から「メール通知」項目（`{ label: "メール通知", icon: Mail, description: "アラートメールの送信先・頻度", href: "/settings/mail" }`）を削除する。

- [ ] ビルド確認: `cd apps/web && pnpm exec tsc --noEmit && pnpm build`。
- [ ] commit: `git add -A && git commit -m "chore(migration): remove mail-notification settings screen"`

---

## Task 6: `apps/api`（Rails アプリ全体）とルート設定の削除

> **⚠ 実行順序の注意（クロスレビュー指摘 M2）**: `apps/api` には `docker-compose.yml` などローカル Rails PostgreSQL の起動設定が含まれる。Task 8 の設定系データ移行（`scripts/migrate-settings.ts` の実行。`RAILS_DATABASE_URL` でローカル Rails DB に接続する）は、**本タスク（Task 6）で `apps/api` を削除するより前に実行しておく**こと。Task 8 の該当ステップを先に終わらせてから本タスクに着手する（タスク番号の並び替えは行わない。実行順のみの注記）。ローカル Rails DB のダンプ・移行済みデータを別途保全済みであれば、この順序制約は不要。

spec §2.2・§5.1（Rails 廃止）。Rails アプリ本体、及びルート・エディタ設定に残る Rails 参照を掃除する。EmailPreference/Active Storage/Sidekiq/Action Mailer/GraphQL-Ruby 等はすべて `apps/api` 配下にあり、ディレクトリ削除でまとめて消える。

**削除対象の完全リスト（`apps/api/` 直下、リポジトリ実査済み）:**
- ディレクトリ: `app/`, `bin/`, `config/`, `db/`, `lib/`, `log/`, `public/`, `script/`, `spec/`, `storage/`, `test/`, `tmp/`, `vendor/`, `.agents/`, `.github/`（`.github/workflows/ci.yml` = Rails CI を含む）, `.kamal/`（Kamal デプロイ設定・`secrets`）
- ファイル: `Dockerfile`, `docker-compose.yml`, `Gemfile`, `Gemfile.lock`, `Rakefile`, `config.ru`, `README.md`, `mise.toml`, `skills-lock.json`, `.dockerignore`, `.env`, `.env.example`, `.gitattributes`, `.gitignore`, `.rspec`, `.rubocop.yml`, `.ruby-version`
- （git status 上の未コミット新規ファイル群 `app/graphql/...email_preference...`, `app/models/email_preference.rb`, `db/migrate/2026..._create_email_preferences.rb`, `spec/...email_preferences...` 等もこのディレクトリ配下なので同時に消える）

**ルート側の Rails 参照（実査済み・編集対象）:**
- `package.json`（ルート）: `"dev:api": "echo 'Rails API: cd apps/api && rails server'"` を削除
- `.vscode/settings.json`: 全行が Ruby-LSP/rubocop 設定 → 空 `{}` にする
- `pnpm-workspace.yaml`: `packages: - 'apps/*'` は `apps/web` のみ残っても有効。**変更不要**（確認のみ）

**Files（編集）:**
- `/Users/hiroshi/Desktop/work/rails/kakeibo/package.json`
- `/Users/hiroshi/Desktop/work/rails/kakeibo/.vscode/settings.json`

- [ ] 事前確認: `apps/api` への参照が他に残っていないか再確認する（`docs/superpowers` 配下の設計書は除外）:

```bash
cd /Users/hiroshi/Desktop/work/rails/kakeibo
grep -rln "apps/api" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git . \
  | grep -v "^./apps/api/" | grep -v "docs/superpowers"
# 期待される出力: ./package.json  ./.vscode/settings.json  ./CLAUDE.md（CLAUDE.md は Task 7 で書き換え）
```

- [ ] 削除前確認（M2）: Task 8 の設定系データ移行（`scripts/migrate-settings.ts` 実行）が完了済みであることを確認する。未実施なら本タスクを中断し、先に Task 8 の該当ステップ（ローカル Rails DB → Supabase への移行実行）を終わらせる。
- [ ] ディレクトリ削除（追跡・未追跡ファイルが混在するため `rm -rf` で消し、後段の `git add -A` で追跡ファイルの削除を反映する）: `cd /Users/hiroshi/Desktop/work/rails/kakeibo && rm -rf apps/api`
- [ ] ルート `package.json` を編集し、`dev:api` スクリプト行を削除する:
```json
  "scripts": {
    "dev:web": "pnpm --filter web dev",
    "dev:api": "echo 'Rails API: cd apps/api && rails server'"
  },
```
→
```json
  "scripts": {
    "dev:web": "pnpm --filter web dev"
  },
```
- [ ] `.vscode/settings.json` の内容を以下に置き換える（Ruby-LSP 設定を除去）:
```json
{}
```
- [ ] `pnpm-workspace.yaml` が `apps/*` のままで問題ないことを確認する（変更不要）。
- [ ] 依存の再解決とビルド確認: `cd /Users/hiroshi/Desktop/work/rails/kakeibo && pnpm install && cd apps/web && pnpm build`。
- [ ] commit: `cd /Users/hiroshi/Desktop/work/rails/kakeibo && git add -A && git commit -m "chore(migration): delete apps/api (Rails) and root Rails config"`

---

## Task 7: `CLAUDE.md` 全面書き換え

spec §2.2・§12。プロジェクトの単一情報源を新スタック（Next.js フルスタック）向けに書き換える。進捗は移行完了状態に更新し、Rails 固有の開発ルール（TDD の Factory→spec→実装 順など）を新スタック向けに更新、学習用の「コマンドは自分でやらない」ルールはオーケストレータ委任の現方針を踏まえ簡潔化する。

**Files（編集）:** `/Users/hiroshi/Desktop/work/rails/kakeibo/CLAUDE.md`

- [ ] `CLAUDE.md` の内容を以下の全文に置き換える:

```markdown
# かけいぼ プロジェクト

## 概要
個人用・単一ユーザーの家計簿アプリ。クレカ利用通知メールを Gmail 自動転送 → CloudMailin
Webhook 経由で受信し、当日中に自動で取引記録する。食費の予算オーバーを防ぐことがコア目的。
Next.js フルスタック（App Router + Drizzle ORM）構成で、旧 Rails/GraphQL 構成からは全面移行済み。

## 技術スタック
- フルスタック: Next.js 16（App Router / RSC / Route Handler / Server Actions）
- ORM: Drizzle ORM（`postgres-js` ドライバ、Supabase pooler 経由）
- DB: Supabase PostgreSQL（RLS 不使用・サーバー側接続のみ）
- バリデーション: zod
- メール受信: CloudMailin（Normalized JSON Webhook）
- 認証: 共有パスワード + HMAC 署名 cookie（Web Crypto API、`proxy.ts`）
- テスト: Vitest（純粋ロジックのユニット + `@electric-sql/pglite` による DB 統合テスト）
- ホスティング: Vercel（apps/web を Root Directory に）

## ディレクトリ構成
- apps/web/        → Next.js フルスタックアプリ（唯一のアプリ）
  - src/db/          → Drizzle スキーマ・クライアント
  - src/lib/         → 純粋ロジック（budget-pace / monthly-summary / alerts / email-parser / dates）
  - src/actions/     → Server Actions（更新系）
  - src/app/api/inbound-email/ → メール受信 Webhook
  - src/test/        → pglite テスト基盤
  - scripts/         → 1回きりの移行スクリプト等
- docs/            → 要件定義書・設計書・実装計画

## アーキテクチャ要点
- 取引記録・アラート判定は「取引 insert と同一DBトランザクション内で同期実行」する
  （旧 Sidekiq/cron は廃止。支出発生時にのみ判定すればバッチと同結果、という設計根拠）。
- 日付演算（月初・末日・経過日数）は Asia/Tokyo 固定で `src/lib/dates.ts` に集約する。
  実行環境TZ（Vercel は UTC）に依存させない。
- `db/client.ts` はアプリ実行時の pooler 接続（`prepare: false` 必須）。DDL は `DIRECT_URL` 直結。

## 開発ルール
- TDD で進める（テスト先行で Red を確認 → 実装 → Green）。
  - 純粋ロジック（`src/lib/*`）は Vitest のユニットテスト、Server Actions / Webhook は
    pglite 統合テストでカバーする。
- コミットは Conventional Commits 形式（feat: / fix: / chore: / test: / refactor: / docs:）。
- main への直接コミットは避け、作業ブランチを切る。
- 外部入力（メール本文・フォーム）は必ず検証し、失敗ケースもテストで押さえる。

## 進捗
Rails → Next.js フルスタック移行は完了。以降の機能追加は apps/web 内で行う。

参照: `docs/superpowers/specs/2026-07-09-rails-to-nextjs-migration-design.md`（移行設計書＝仕様の正）

## 環境変数
- `DATABASE_URL`     : Supabase pooler（transaction-mode, port 6543）。実行時接続、`prepare: false`
- `DIRECT_URL`       : Supabase 直結（port 5432）。drizzle-kit の DDL 用
- `AUTH_PASSWORD`    : ログイン共有パスワード
- `AUTH_COOKIE_SECRET`: 認証 cookie の HMAC 署名鍵
- `INBOUND_TOKEN`    : CloudMailin Webhook の URL トークン

## 参照ドキュメント
- 移行設計書: docs/superpowers/specs/2026-07-09-rails-to-nextjs-migration-design.md
- 実装計画: docs/superpowers/plans/
```

- [ ] commit: `git add CLAUDE.md && git commit -m "docs(migration): rewrite CLAUDE.md for Next.js full-stack"`

---

## Task 8: デプロイ手順 — Supabase セットアップ（ユーザー実行）

> **⚠ 実行順序の注意（クロスレビュー指摘 M2）**: 本タスクの設定系データ移行ステップ（`scripts/migrate-settings.ts` の実行）は、Task 6 で `apps/api`（ローカル Rails PostgreSQL の起動設定含む）を削除する **前に** 実行すること。Task 6 が先に完了していると、移行スクリプトが参照するローカル Rails DB を起動できなくなる。

spec §11・§10。以下はユーザーが手で実行するチェックリスト（コミット対象なし）。`<...>` は実値に置き換える。

- [ ] https://supabase.com/dashboard で New project を作成する（Organization を選び、Region は `Northeast Asia (Tokyo) / ap-northeast-1`、Database Password を強力な値で設定して控える）。
- [ ] 接続文字列を取得する: Project Settings → Database → Connection string。
  - **DATABASE_URL**（アプリ実行時・pooler / port **6543**）:
    `postgresql://postgres.<project-ref>:<DB_PASSWORD>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`
  - **DIRECT_URL**（DDL 用・直結 / port **5432**）:
    `postgresql://postgres.<project-ref>:<DB_PASSWORD>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`
    （"Session"/"Direct" タブ側の文字列を使う。Supabase の表示に従い port が 5432 のものを選ぶ）
- [ ] ローカル `apps/web/.env`（gitignore 済みを確認）に両方を記載する:
```
DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.<ref>:<pw>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```
- [ ] Drizzle マイグレーションを適用する（DDL は DIRECT_URL 使用。drizzle 設定・マイグレーションは計画A/フェーズ1の生成物）:
```bash
cd apps/web
pnpm drizzle-kit migrate      # 生成済みマイグレーションを Supabase に適用
```
- [ ] Supabase ダッシュボードの Table Editor で `categories` / `transactions` / `inbound_emails` などのテーブルが作成されたことを確認する。
- [ ] 設定系データ移行スクリプトを実行する（`scripts/migrate-settings.ts` = 計画A/フェーズ2 の生成物。ローカル Rails 用 PostgreSQL → Supabase へ categories / budgets / store_category_mappings / budget_alert_settings / pace_alert_settings を移行。spec §10）。**M2 の順序注意のとおり、`apps/api` 削除（Task 6）より前に実行すること**:
```bash
cd apps/web
# ローカル Rails DB を起動しておく（apps/api/docker-compose.yml 相当の Postgres。
# 本ステップは Task 6 で apps/api を削除する前に済ませること）。
# 接続変数は計画Aの migrate-settings.ts 実装に合わせ、
# RAILS_DATABASE_URL=ローカルRails、DIRECT_URL=Supabase直結(5432) を渡す。
# 投入先は Supabase pooler(6543) ではなく DIRECT_URL（直結）を使う。
RAILS_DATABASE_URL=<ローカルRailsの接続文字列> DIRECT_URL=<Supabase直結(5432)の接続文字列> \
  node scripts/migrate-settings.ts
```
- [ ] 移行後、Supabase 上で `store_category_mappings.store_name` に重複・null が無い（spec §4.1 の制約強化前提）ことと、`categories.parent_id` の自己参照が壊れていないことを Table Editor / SQL Editor で確認する。

---

## Task 9: デプロイ手順 — Vercel セットアップ（ユーザー実行）

spec §3・§11。

- [ ] 署名鍵・トークンを生成して控える:
```bash
openssl rand -hex 32   # AUTH_COOKIE_SECRET 用
openssl rand -hex 24   # INBOUND_TOKEN 用
```
- [ ] https://vercel.com/new でリポジトリを import する。
- [ ] **Root Directory を `apps/web` に設定**する（Configure Project → Root Directory → Edit → `apps/web`）。Framework Preset は Next.js が自動検出される。
- [ ] Environment Variables（Production、必要なら Preview にも）を設定する:
  - `DATABASE_URL` = Supabase pooler（port 6543）の文字列（Task 8）
  - `DIRECT_URL` = Supabase 直結（port 5432）の文字列（ビルド時に drizzle-kit を使う場合のみ必要）
  - `AUTH_PASSWORD` = ログイン用の共有パスワード（任意の強い文字列）
  - `AUTH_COOKIE_SECRET` = 上で生成した hex 32B
  - `INBOUND_TOKEN` = 上で生成した hex 24B（Task 10 の CloudMailin URL と一致させる）
- [ ] Deploy を実行し、発行された URL `https://<app>.vercel.app` を控える。
- [ ] `https://<app>.vercel.app/login` にアクセスし、`AUTH_PASSWORD` でログインできることを確認する（認証はフェーズ6の実装に依存）。

---

## Task 10: デプロイ手順 — CloudMailin セットアップ（ユーザー実行）

spec §3・§6。

- [ ] https://www.cloudmailin.com でアカウントを作成する（無料枠: 月1万通）。
- [ ] Address を1つ作成し、割り当てられた受信アドレス（例: `xxxxxxxx@cloudmailin.net`）を控える。
- [ ] Delivery / Target を設定する:
  - **Target URL**: `https://<app>.vercel.app/api/inbound-email?token=<INBOUND_TOKEN>`（`<INBOUND_TOKEN>` は Task 9 と同一値）
  - **Format**: `JSON`（Normalized JSON format）
  - **HTTP method**: POST
  - Raw format は **有効化しない**（spec §6.1。`plain` を一次ソースにする方針）
- [ ] CloudMailin の Test 機能（サンプル送信）で Target を叩き、Vercel のログに 200 が記録されることを確認する。

---

## Task 11: デプロイ手順 — Gmail フィルタ・自動転送設定（ユーザー実行）

spec §6・§6.7/§6.8。転送先確認コードは `inbound_emails.raw_body`（= 保存された CloudMailin `plain` 内容。Raw format 無効のため raw ではなく plain が入る）から取得する。

- [ ] Gmail（`tubukiti2008@gmail.com`）の 設定 → メール転送と POP/IMAP → 「転送先アドレスを追加」に CloudMailin の受信アドレス（Task 10）を入力する。
- [ ] Gmail が確認メールを送信 → CloudMailin 経由で `/api/inbound-email` に届き `inbound_emails` に保存される。Supabase SQL Editor で確認コードを取得する:
```sql
select id, "from", subject, raw_body, created_at
from inbound_emails
order by created_at desc
limit 5;
```
（Gmail からの確認メールは三井住友カード判定に一致しないため `status = 'skipped'` で記録される。確認コードは `raw_body` 本文中にある。spec §6.8）
- [ ] 取得した確認コードを Gmail の転送設定画面に入力し、転送を有効化する。
- [ ] フィルタを作成する: 検索条件 From `statement@vpass.ne.jp`、件名に `ご利用のお知らせ` を含む → フィルタ作成 → 「次のアドレスに転送する」で CloudMailin アドレスを選択する。
- [ ] （任意）既存の該当メールにも同フィルタを適用しないよう注意する（過去分を一括転送すると大量取引が作られるため、新規メールのみ対象にする）。

---

## Task 12: デプロイ手順 — E2E 動作確認（ユーザー実行）

spec §9（E2E はデプロイ前手動確認で足りる方針）。

- [ ] スモークテスト（本番 URL に直接投入して配線を確認）:
```bash
curl -i -X POST "https://<app>.vercel.app/api/inbound-email?token=<INBOUND_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"headers":{"from":"三井住友カード <statement@vpass.ne.jp>","subject":"ご利用のお知らせ【三井住友カード】","message_id":"<e2e-1@vpass.ne.jp>"},"envelope":{"from":"x@vpass.ne.jp"},"plain":" ◎ご利用日：2026/07/09 12:00\n ◎ご利用先：E2Eテスト店\n ◎ご利用金額：100 円"}'
```
- [ ] Supabase SQL Editor で反映を確認する:
```sql
select status, transaction_id from inbound_emails where message_id = '<e2e-1@vpass.ne.jp>';
-- status = 'processed', transaction_id が非null であること
select * from transactions order by created_at desc limit 1;
-- amount=100, store_name='E2Eテスト店', source='email' であること
```
- [ ] `https://<app>.vercel.app/`（ホーム）を開き、投入した取引と（未分類なら）未分類アラート通知が表示されることを確認する。
- [ ] 実経路の確認: 実際にカードを1回利用する（またはテスト用に、Gmail 受信済みの三井住友カード通知メールを1通だけ手動で CloudMailin アドレスへ転送する）→ 数十秒以内にホームへ取引が反映されることを確認する。
- [ ] （後片付け）E2E 用に投入したスモークテスト取引を Supabase 上から削除する:
```sql
delete from transactions where store_name = 'E2Eテスト店';
delete from inbound_emails where message_id = '<e2e-1@vpass.ne.jp>';
```

---

## 完了条件

- [ ] `apps/web/src/app/api/inbound-email/route.ts` が実装され、`route.test.ts` の全ケースが Green。
- [ ] `apps/web` から Apollo/codegen/GraphQL 基盤・`/settings/mail`・関連フックが削除され、`pnpm build` が通る。
- [ ] `apps/api` とルートの Rails 参照が削除され、`CLAUDE.md` が新スタック向けに更新されている。
- [ ] Supabase / Vercel / CloudMailin / Gmail のセットアップ手順に沿って本番が稼働し、E2E スモークが 200 + `processed` になる。
- [ ] 申し送り: `notification-list.tsx` の `'InboundEmail'` 分岐追加（spec §8.1）は計画B（フェーズ4）で対応する。
```
