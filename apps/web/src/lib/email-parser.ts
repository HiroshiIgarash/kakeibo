export type ParseResult =
  | { ok: true; amount: number; storeName: string; purchasedAt: Date }
  | { ok: false; reason: "not_target" | "parse_error"; error?: string };

const TARGET_FROM = "statement@vpass.ne.jp";
const TARGET_SUBJECT = "ご利用のお知らせ";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 実 fixture の text/plain はラベルに「ご」が付かない（◇利用日 等）ため (?:ご)? で両対応。
const DATE_RE = /(?:ご)?利用日(?:時)?[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/;
const STORE_RE = /(?:ご)?利用先[：:]\s*(.+)/;
const AMOUNT_RE = /(?:ご)?利用金額[：:]\s*([\d,]+)\s*円/;

/** 三井住友カード(Vpass)のクレカ利用通知メールをパースする。 */
export function parseSmbcEmail(input: {
  from: string;
  subject: string;
  plain: string;
}): ParseResult {
  const { from, subject, plain } = input;

  if (!from.includes(TARGET_FROM) || !subject.includes(TARGET_SUBJECT)) {
    return { ok: false, reason: "not_target" };
  }

  const dateMatch = plain.match(DATE_RE);
  const storeMatch = plain.match(STORE_RE);
  const amountMatch = plain.match(AMOUNT_RE);

  const missing: string[] = [];
  if (!dateMatch) missing.push("利用日");
  if (!storeMatch) missing.push("利用先");
  if (!amountMatch) missing.push("利用金額");
  if (missing.length > 0) {
    return { ok: false, reason: "parse_error", error: `抽出失敗: ${missing.join(", ")}` };
  }

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
  const amount = Number.parseInt(amountMatch![1].replace(/,/g, ""), 10);

  return { ok: true, amount, storeName, purchasedAt };
}
