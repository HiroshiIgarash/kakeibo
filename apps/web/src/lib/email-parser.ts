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
  const amountMatch = plain.match(AMOUNT_RE) ?? matchJpyAmount(plain);

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

/**
 * 失敗メールのプリフィル用の部分抽出。取れたフィールドだけ返す（全て optional）。
 * parseSmbcEmail と同じラベル正規表現・店名正規化を使うが、金額は数値化せず生文字列で返す
 * （外貨建て等、円表記でない金額のヒント表示用）。
 */
export function extractSmbcFields(plain: string): {
  storeName?: string;
  date?: string; // 'YYYY-MM-DD'
  amountRaw?: string;
} {
  const result: { storeName?: string; date?: string; amountRaw?: string } = {};

  const storeMatch = plain.match(STORE_RE);
  if (storeMatch) result.storeName = storeMatch[1].trim().normalize("NFKC");

  const dateMatch = plain.match(DATE_RE);
  if (dateMatch) {
    const [y, m, d] = dateMatch[1].split("/").map(Number);
    result.date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const amountRawMatch = plain.match(/(?:ご)?利用金額[：:]\s*(.+)/);
  if (amountRawMatch) result.amountRaw = amountRawMatch[1].trim();

  return result;
}
