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

// 金額行から符号付き整数円を返す。JPY の小数部が非ゼロ（例: 990.50 JPY）は
// 勝手に丸めず null（抽出失敗 → 失敗メール + 手入力へ）。
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

// 1明細ブロックを抽出する。欠損フィールドがあればフィールド名の配列を返す。
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
  return { amount: amount!, storeName, purchasedAt };
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
