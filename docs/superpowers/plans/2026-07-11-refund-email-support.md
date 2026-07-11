# 返金・取消メール対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to実装 this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 取消（マイナス金額）と「ご利用明細のお知らせ」（別件名・複数明細）を取り込めるようにし、マイナス金額を正額で二重計上する現行バグを直す。

**Architecture:** パーサーを「◇利用日ブロック分割 → 各ブロックから抽出」の複数明細構造（`parseSmbcEmailItems`）に再構成し、既存 `parseSmbcEmail` は先頭1件を返す互換ラッパー化。金額正規表現に符号 `-?` を追加（円・JPY 両方）。Webhook は全アイテムを単一トランザクションで取引化し、email は先頭取引に紐付け。

**Tech Stack:** TypeScript / Vitest（パーサー: ユニット、Webhook: pglite 統合）

**Spec:** `docs/superpowers/specs/2026-07-11-refund-email-support-design.md`

## Global Constraints

- 実装は git worktree 上（ベース: development）
- テスト実行: `pnpm -C apps/web test <path>` / コミット: Conventional Commits + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- TDD。既存テスト（正常系・not_target・parse_error・JPY）は全て挙動不変で green を維持
- `extractSmbcFields` は無変更

---

### Task 1: パーサー再構成（符号・複数明細・件名追加）（TDD）

**Files:**
- Modify: `apps/web/src/lib/email-parser.ts`
- Test: `apps/web/src/lib/email-parser.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ParsedItem = { amount: number; storeName: string; purchasedAt: Date };
  export type ParseItemsResult =
    | { ok: true; items: ParsedItem[] }
    | { ok: false; reason: "not_target" | "parse_error"; error?: string };
  export function parseSmbcEmailItems(input: { from: string; subject: string; plain: string }): ParseItemsResult;
  // parseSmbcEmail は items[0] を返す互換ラッパー（シグネチャ不変）
  ```

- [ ] **Step 1: Write the failing tests**

`email-parser.test.ts` — import に `parseSmbcEmailItems` を追加し、`parseSmbcEmail` describe 内に追加:

```ts
  describe("取消・返品（マイナス金額）", () => {
    it("取消メール（-1,080円）は負の金額で抽出する", () => {
      const plain =
        "◇利用日：2025/08/31 10:28\n◇利用先：ROCKET NOW\n◇利用取引：取消\n◇利用金額：-1,080円\n";
      const r = parseSmbcEmail({ from: FROM, subject: SUBJECT, plain });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount).toBe(-1080);
      expect(r.storeName).toBe("ROCKET NOW");
    });

    it("JPY のマイナス（-990.00 JPY）も負の金額で抽出する", () => {
      const plain =
        "◇利用日：2026/06/09 20:32\n◇利用先：GOOGLE*YOUTUBE MEMBER\n◇利用取引：返品\n◇利用金額：-990.00 JPY\n";
      const r = parseSmbcEmail({ from: FROM, subject: SUBJECT, plain });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount).toBe(-990);
    });
  });
```

新 describe をファイル末尾（extractSmbcFields describe の後）に追加:

```ts
describe("parseSmbcEmailItems（複数明細・ご利用明細のお知らせ）", () => {
  const MEISAI_SUBJECT = "ご利用明細のお知らせ【三井住友カード】";

  it("件名「ご利用明細のお知らせ」を対象とし、時刻なし利用日を抽出する", async () => {
    const { parseSmbcEmailItems } = await import("./email-parser");
    const plain = "◇利用日：2025/10/03\n◇利用先：Ａｍａｚｏｎプライム会費\n◇利用取引：返品\n◇利用金額：-264円\n";
    const r = parseSmbcEmailItems({ from: FROM, subject: MEISAI_SUBJECT, plain });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(1);
    expect(r.items[0].amount).toBe(-264);
    expect(r.items[0].storeName).toBe("Amazonプライム会費"); // NFKC 正規化
    expect(r.items[0].purchasedAt.toISOString()).toBe("2025-10-02T15:00:00.000Z"); // 10/03 00:00 JST
  });

  it("複数ブロック（返品と買物の相殺ペア）を全件抽出する", async () => {
    const { parseSmbcEmailItems } = await import("./email-parser");
    const plain = [
      "◇利用日：2025/08/31",
      "◇利用先：ロケツトナウ",
      "◇利用取引：返品",
      "◇利用金額：-1,080円",
      "",
      "◇利用日：2025/08/31",
      "◇利用先：ロケツトナウ",
      "◇利用取引：買物",
      "◇利用金額：1,080円",
      "",
    ].join("\n");
    const r = parseSmbcEmailItems({ from: FROM, subject: MEISAI_SUBJECT, plain });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map((i) => i.amount)).toEqual([-1080, 1080]);
  });

  it("1ブロックでも欠損があれば全体を parse_error にする", async () => {
    const { parseSmbcEmailItems } = await import("./email-parser");
    const plain = [
      "◇利用日：2025/08/31",
      "◇利用先：ロケツトナウ",
      "◇利用金額：-1,080円",
      "",
      "◇利用日：2025/08/31",
      "◇利用先：ロケツトナウ",
      // 利用金額 欠落
      "",
    ].join("\n");
    const r = parseSmbcEmailItems({ from: FROM, subject: MEISAI_SUBJECT, plain });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("parse_error");
    expect(r.error).toContain("利用金額");
  });

  it("対象外件名は not_target のまま", async () => {
    const { parseSmbcEmailItems } = await import("./email-parser");
    const r = parseSmbcEmailItems({ from: FROM, subject: "転送確認メール", plain: "◇利用金額：100円" });
    expect(r).toEqual({ ok: false, reason: "not_target" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web test src/lib/email-parser.test.ts`
Expected: 新規テストが FAIL（-1080 が +1080 になる / parseSmbcEmailItems 未定義）

- [ ] **Step 3: Write implementation**

`email-parser.ts` を再構成:

```ts
export type ParsedItem = { amount: number; storeName: string; purchasedAt: Date };

export type ParseResult =
  | { ok: true; amount: number; storeName: string; purchasedAt: Date }
  | { ok: false; reason: "not_target" | "parse_error"; error?: string };

export type ParseItemsResult =
  | { ok: true; items: ParsedItem[] }
  | { ok: false; reason: "not_target" | "parse_error"; error?: string };

const TARGET_FROM = "statement@vpass.ne.jp";
// 「ご利用のお知らせ」= 承認時の速報。「ご利用明細のお知らせ」= 明細確定時の差分通知
//（返品等。1通に複数明細があり得る）。後者は前者を部分文字列に含まないため個別に列挙する。
const TARGET_SUBJECTS = ["ご利用のお知らせ", "ご利用明細のお知らせ"];
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 実 fixture の text/plain はラベルに「ご」が付かない（◇利用日 等）ため (?:ご)? で両対応。
const DATE_RE = /(?:ご)?利用日(?:時)?[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/;
const STORE_RE = /(?:ご)?利用先[：:]\s*(.+)/;
// 取消・返品はマイナス金額（例: -1,080円）で届くため符号を許可する
const AMOUNT_RE = /(?:ご)?利用金額[：:]\s*(-?)([\d,]+)\s*円/;
// 円建て海外加盟店（例: GOOGLE*YOUTUBE MEMBER）は「990.00 JPY」形式で届く。
const AMOUNT_JPY_RE = /(?:ご)?利用金額[：:]\s*(-?)([\d,]+)(?:\.(\d+))?\s*JPY/;

// 金額行から符号付き整数円を返す。JPY の小数部が非ゼロは丸めず null（抽出失敗 → 手入力へ）。
function matchAmount(block: string): number | null {
  const yen = block.match(AMOUNT_RE);
  if (yen) {
    const n = Number.parseInt(yen[2].replace(/,/g, ""), 10);
    return yen[1] === "-" ? -n : n;
  }
  const jpy = block.match(AMOUNT_JPY_RE);
  if (!jpy) return null;
  if (jpy[3] && Number(jpy[3]) !== 0) return null;
  const n = Number.parseInt(jpy[2].replace(/,/g, ""), 10);
  return jpy[1] === "-" ? -n : n;
}

// 本文を「利用日」ラベルの出現位置で明細ブロックに分割する（明細メールは1通に複数明細）
function splitItemBlocks(plain: string): string[] {
  const re = /(?:ご)?利用日(?:時)?[：:]/g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(plain)) !== null) starts.push(m.index);
  return starts.map((s, i) => plain.slice(s, starts[i + 1] ?? plain.length));
}

function parseItemBlock(block: string): ParsedItem | string[] {
  const dateMatch = block.match(DATE_RE);
  const storeMatch = block.match(STORE_RE);
  const amount = matchAmount(block);

  const missing: string[] = [];
  if (!dateMatch) missing.push("利用日");
  if (!storeMatch) missing.push("利用先");
  if (amount == null) missing.push("利用金額");
  if (missing.length > 0) return missing;

  const [, ymd, hm] = dateMatch!;
  const [y, mo, d] = ymd.split("/").map(Number);
  let hh = 0;
  let mm = 0;
  if (hm) {
    const [h, m] = hm.split(":").map(Number);
    hh = h;
    mm = m;
  }
  // マッチした年月日・時刻は JST として解釈し、絶対時刻(UTC)へ変換する。
  const purchasedAt = new Date(Date.UTC(y, mo - 1, d, hh, mm, 0) - JST_OFFSET_MS);
  // 全角ハイフン・全角英数の表記揺れを吸収するため NFKC 正規化する。
  const storeName = storeMatch![1].trim().normalize("NFKC");
  return { amount, storeName, purchasedAt };
}

/** 三井住友カード(Vpass)の利用通知/明細通知メールから全明細をパースする。 */
export function parseSmbcEmailItems(input: {
  from: string;
  subject: string;
  plain: string;
}): ParseItemsResult {
  const { from, subject, plain } = input;

  if (!from.includes(TARGET_FROM) || !TARGET_SUBJECTS.some((s) => subject.includes(s))) {
    return { ok: false, reason: "not_target" };
  }

  const blocks = splitItemBlocks(plain);
  if (blocks.length === 0) {
    return { ok: false, reason: "parse_error", error: "抽出失敗: 利用日" };
  }

  const items: ParsedItem[] = [];
  for (const block of blocks) {
    const item = parseItemBlock(block);
    if (Array.isArray(item)) {
      // 1件でも欠損があれば部分取り込みせず全体を失敗にする（人間の確認に回す）
      return { ok: false, reason: "parse_error", error: `抽出失敗: ${item.join(", ")}` };
    }
    items.push(item);
  }
  return { ok: true, items };
}

/** 先頭1明細のみ返す互換API（単一明細前提の既存呼び出し向け） */
export function parseSmbcEmail(input: {
  from: string;
  subject: string;
  plain: string;
}): ParseResult {
  const r = parseSmbcEmailItems(input);
  if (!r.ok) return r;
  const { amount, storeName, purchasedAt } = r.items[0];
  return { ok: true, amount, storeName, purchasedAt };
}
```

（`extractSmbcFields` と定数 `DATE_RE`/`STORE_RE` の既存利用は維持。既存の
`matchJpyAmount`・単一抽出ロジックは上記に置き換え）

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web test src/lib/email-parser.test.ts`
Expected: 全 PASS（既存13 + 新規7）

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/email-parser.ts apps/web/src/lib/email-parser.test.ts
git commit -m "feat(web): parse refunds and multi-item statement emails"
```

---

### Task 2: Webhook の複数明細対応（TDD）

**Files:**
- Modify: `apps/web/src/app/api/inbound-email/route.ts`
- Test: `apps/web/src/app/api/inbound-email/route.test.ts`

**Interfaces:**
- Consumes: `parseSmbcEmailItems`（Task 1）

- [ ] **Step 1: Write the failing test**

`route.test.ts` に追加（既存のテストヘルパ・payload 生成に合わせて調整。実ファイルの
ヘルパを読んで既存パターンを踏襲すること）:

```ts
  it("複数明細メールは全件を取引化し、email は先頭取引に紐づく", async () => {
    const plain = [
      "◇利用日：2025/08/31",
      "◇利用先：ロケツトナウ",
      "◇利用取引：返品",
      "◇利用金額：-1,080円",
      "",
      "◇利用日：2025/08/31",
      "◇利用先：ロケツトナウ",
      "◇利用取引：買物",
      "◇利用金額：1,080円",
    ].join("\n");
    const res = await postWebhook({
      headers: {
        from: "三井住友カード <statement@vpass.ne.jp>",
        subject: "ご利用明細のお知らせ【三井住友カード】",
        message_id: "<multi-1@test>",
      },
      plain,
    });
    expect(res.status).toBe(200);
    const txRows = await testDb.select().from(transactions);
    expect(txRows).toHaveLength(2);
    expect(txRows.map((t) => t.amount).sort((a, b) => a - b)).toEqual([-1080, 1080]);
    const [email] = await testDb.select().from(inboundEmails);
    expect(email.status).toBe("processed");
    expect(email.transactionId).not.toBeNull();
  });
```

（`postWebhook` 相当のリクエスト生成が既存テストにあるはず。無ければ既存 it の呼び方をコピー）

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test src/app/api/inbound-email/route.test.ts`
Expected: FAIL（現状は件名 not_target → skipped、取引0件）

- [ ] **Step 3: Write implementation**

`route.ts`:
- import を `parseSmbcEmailItems` に変更
- 手順4: `const parsed = parseSmbcEmailItems({ from, subject: subject ?? "", plain });`
  （失敗分岐は現行のまま）
- 手順5-6 を全アイテムループに変更:

```ts
  // 5-6. 全明細を取引化（店名マッピング照合 → insert → アラート判定）+
  //      inbound_emails 更新を単一DBトランザクションで(spec §6 手順6 / §5.5)
  await db.transaction(async (tx) => {
    let firstTransactionId: number | null = null;
    for (const item of parsed.items) {
      // 店舗名は NFKC 正規化済み（パーサー側）。store_category_mappings と照合(spec §6.1)
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

    // 複数明細の場合は先頭の取引に紐付ける（スキーマは1対1のため）
    await tx
      .update(inboundEmails)
      .set({ status: "processed", transactionId: firstTransactionId })
      .where(eq(inboundEmails.id, inboundEmailId));
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web test src/app/api/inbound-email/route.test.ts`
Expected: 全 PASS（既存 + 新規）

- [ ] **Step 5: 全テスト・lint・build**

Run: `pnpm -C apps/web exec vitest run && pnpm -C apps/web lint && pnpm -C apps/web build`
Expected: 全 green / 変更ファイル指摘なし / build 成功

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/inbound-email/route.ts apps/web/src/app/api/inbound-email/route.test.ts
git commit -m "feat(web): import all items from multi-item statement emails"
```

---

## 最終確認

- 全テスト green・build 成功 → development マージ → main 反映（Vercel デプロイ）
- 以後、取消メール = マイナス取引で自動相殺、明細メール（返品）も自動取り込み
