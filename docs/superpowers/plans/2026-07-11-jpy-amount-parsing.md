# メール金額パーサー JPY 表記対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `◇利用金額：990.00 JPY` 形式（円建て海外加盟店、例: YouTube メンバーシップ）を自動で円として取り込む。

**Architecture:** `parseSmbcEmail` の金額抽出を「円表記（既存 `AMOUNT_RE`、変更なし）→ JPY 表記（新規 `AMOUNT_JPY_RE`）」の順のフォールバックにする。JPY の小数部が非ゼロなら従来どおり抽出失敗（金額を勝手に丸めない）。`extractSmbcFields` は無変更。

**Tech Stack:** TypeScript / Vitest（純粋ロジックのユニットテストのみ、DB 不要）

**Spec:** `docs/superpowers/specs/2026-07-11-jpy-amount-parsing-design.md`

## Global Constraints

- 実装は git worktree 上で行う（superpowers:using-git-worktrees でセットアップ、ベースは `development`）
- テスト実行: `pnpm -C apps/web test <path>`（worktree ルートから）
- コミット: Conventional Commits 形式、末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- TDD: テスト先行で Red 確認 → 実装 → Green 確認
- 円表記（`…円`）の既存パスは挙動不変。USD 等の他通貨は従来どおり parse_error

---

### Task 1: `parseSmbcEmail` に JPY 表記フォールバック追加

**Files:**
- Modify: `apps/web/src/lib/email-parser.ts`（`AMOUNT_RE` 定義の直後と `parseSmbcEmail` 内の金額抽出）
- Test: `apps/web/src/lib/email-parser.test.ts`（`parseSmbcEmail` describe 内にテスト追加）

**Interfaces:**
- Consumes: 既存の `parseSmbcEmail(input: { from; subject; plain }): ParseResult`
- Produces: 外部シグネチャ変更なし（内部に `matchJpyAmount(plain: string): [string, string] | null` を追加）

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/email-parser.test.ts` の `parseSmbcEmail` describe 内（「必須項目が欠けると parse_error」の it の後）に追加:

```ts
  describe("JPY表記（円建て海外加盟店）", () => {
    const jpyPlain = (amountLine: string) =>
      `◇利用日：2026/06/09 20:32\n◇利用先：GOOGLE*YOUTUBE MEMBER\n◇利用取引：買物\n◇利用金額：${amountLine}\n`;

    it("990.00 JPY は 990円として抽出する", () => {
      const r = parseSmbcEmail({ from: FROM, subject: SUBJECT, plain: jpyPlain("990.00 JPY") });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount).toBe(990);
      expect(r.storeName).toBe("GOOGLE*YOUTUBE MEMBER");
      expect(r.purchasedAt.toISOString()).toBe("2026-06-09T11:32:00.000Z"); // 20:32 JST
    });

    it("スペース無し（990JPY）も抽出する", () => {
      const r = parseSmbcEmail({ from: FROM, subject: SUBJECT, plain: jpyPlain("990JPY") });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount).toBe(990);
    });

    it("カンマ区切り（1,990.00 JPY）は 1990円", () => {
      const r = parseSmbcEmail({ from: FROM, subject: SUBJECT, plain: jpyPlain("1,990.00 JPY") });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount).toBe(1990);
    });

    it("小数部が非ゼロ（990.50 JPY）は丸めず parse_error", () => {
      const r = parseSmbcEmail({ from: FROM, subject: SUBJECT, plain: jpyPlain("990.50 JPY") });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("parse_error");
      expect(r.error).toContain("利用金額");
    });

    it("他通貨（9.99 USD）は従来どおり parse_error", () => {
      const r = parseSmbcEmail({ from: FROM, subject: SUBJECT, plain: jpyPlain("9.99 USD") });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("parse_error");
      expect(r.error).toContain("利用金額");
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web test src/lib/email-parser.test.ts`
Expected: FAIL — 新規5件のうち成功系3件が fail（現状 JPY は抽出失敗のため）。失敗系2件は既存挙動で pass する

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/email-parser.ts` — `AMOUNT_RE` の直後に追加:

```ts
// 円建て海外加盟店（例: GOOGLE*YOUTUBE MEMBER）は「990.00 JPY」形式で届く。
const AMOUNT_JPY_RE = /(?:ご)?利用金額[：:]\s*([\d,]+)(?:\.(\d+))?\s*JPY/;

// JPY 表記の金額行にマッチしたら [全体, 整数部] を返す。
// 小数部が非ゼロ（例: 990.50 JPY）は勝手に丸めず null（抽出失敗 → 手入力へ）。
function matchJpyAmount(plain: string): [string, string] | null {
  const m = plain.match(AMOUNT_JPY_RE);
  if (!m) return null;
  if (m[2] && Number(m[2]) !== 0) return null;
  return [m[0], m[1]];
}
```

`parseSmbcEmail` 内の金額抽出行を変更:

```ts
  const amountMatch = plain.match(AMOUNT_RE) ?? matchJpyAmount(plain);
```

（`missing.push("利用金額")` 判定と `amountMatch![1]` の利用箇所は配列 index 1 が整数部のまま成立するため変更不要）

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web test src/lib/email-parser.test.ts`
Expected: PASS（既存8件 + 新規5件 = 13件）

- [ ] **Step 5: 全テスト・lint で回帰確認**

Run: `pnpm -C apps/web test && pnpm -C apps/web lint`
Expected: 全 PASS（inbound-emails / queries の失敗メール系テストは failed 状態の保存済みレコードを扱うため影響なし）。lint は今回変更ファイルに指摘なし

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/email-parser.ts apps/web/src/lib/email-parser.test.ts
git commit -m "feat(web): parse JPY-denominated amounts in card usage emails

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
