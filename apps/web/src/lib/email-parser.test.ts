import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSmbcEmail } from "./email-parser";

const FIXTURE_DIR = "../../../../docs/superpowers/specs/fixtures/";

// fixture(.eml) の text/plain パートを CloudMailin の `plain`（UTF-8）相当へ再構築する。
// fixture は ESC(0x1B) が欠落しているため $B/(B 等の直前に ESC を補い、
// デコード後に残る U+FFFD（ロスした shift 由来のゴミ）を除去する。
function loadPlain(fileName: string): string {
  const path = fileURLToPath(new URL(FIXTURE_DIR + fileName, import.meta.url));
  const s = readFileSync(path).toString("latin1");
  const p = s.indexOf("Content-Type: text/plain");
  const headerEnd = s.indexOf("\n\n", p);
  const bodyStart = headerEnd + 2;
  const nextBoundary = s.indexOf("\n--", bodyStart);
  const body = s.slice(bodyStart, nextBoundary < 0 ? undefined : nextBoundary);
  const withEsc = body.replace(/\$B|\$@|\(B|\(J|\(I/g, (m) => "\x1b" + m);
  const decoded = new TextDecoder("iso-2022-jp").decode(Buffer.from(withEsc, "latin1"));
  return decoded.replace(/�/g, "");
}

// CloudMailin は headers.from / headers.subject をデコード済みで届ける。
const FROM = "三井住友カード <statement@vpass.ne.jp>";
const SUBJECT = "ご利用のお知らせ【三井住友カード】";

describe("parseSmbcEmail", () => {
  it("全角店名・時刻付き（sample1）を抽出する", () => {
    const plain = loadPlain("smbc-usage-notification-sample.eml");
    const r = parseSmbcEmail({ from: FROM, subject: SUBJECT, plain });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amount).toBe(433);
    expect(r.storeName).toBe("セブン-イレブン"); // NFKC 後は ASCII ハイフン
    expect(r.purchasedAt.toISOString()).toBe("2026-07-08T07:22:00.000Z"); // 16:22 JST
  });

  it("ASCII店名・カンマ区切り金額（sample2）を抽出する", () => {
    const plain = loadPlain("smbc-usage-notification-sample2.eml");
    const r = parseSmbcEmail({ from: FROM, subject: SUBJECT, plain });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amount).toBe(1076);
    expect(r.storeName).toBe("BELC WAKOSHIRAKO");
    expect(r.purchasedAt.toISOString()).toBe("2026-07-08T14:24:00.000Z"); // 23:24 JST
  });

  it("対象外の送信元は not_target", () => {
    const r = parseSmbcEmail({
      from: "noreply@example.com",
      subject: SUBJECT,
      plain: "利用金額：100 円",
    });
    expect(r).toEqual({ ok: false, reason: "not_target" });
  });

  it("対象外の件名は not_target", () => {
    const r = parseSmbcEmail({
      from: FROM,
      subject: "転送確認メール",
      plain: "利用金額：100 円",
    });
    expect(r).toEqual({ ok: false, reason: "not_target" });
  });

  it("必須項目が欠けると parse_error", () => {
    const r = parseSmbcEmail({
      from: FROM,
      subject: SUBJECT,
      plain: "利用先：どこか\n利用金額：100 円", // 利用日 欠落
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("parse_error");
    expect(r.error).toContain("利用日");
  });
});

describe("extractSmbcFields（部分抽出・失敗メールのプリフィル用）", () => {
  it("外貨建て本文から店名と日付を抽出し、金額は生文字列で返す", async () => {
    const { extractSmbcFields } = await import("./email-parser");
    const plain = "◇利用日：2026/06/09 20:32\n◇利用先：GOOGLE*YOUTUBE MEMBER\n◇利用取引：買物\n◇利用金額：990.00 JPY\n";
    expect(extractSmbcFields(plain)).toEqual({
      storeName: "GOOGLE*YOUTUBE MEMBER",
      date: "2026-06-09",
      amountRaw: "990.00 JPY",
    });
  });

  it("全角ハイフン店名はNFKC正規化される", async () => {
    const { extractSmbcFields } = await import("./email-parser");
    const plain = "◇利用先：セブン－イレブン\n";
    expect(extractSmbcFields(plain).storeName).toBe("セブン-イレブン");
  });

  it("何も無い本文は全てundefined", async () => {
    const { extractSmbcFields } = await import("./email-parser");
    expect(extractSmbcFields("こんにちは")).toEqual({});
  });
});
