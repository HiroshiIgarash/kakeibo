/**
 * 店舗名の正規化規則（spec §6.1）。email-parser 側とも一致させるため共有する。
 * 注: `'use server'` ファイルは async 関数以外を export できない（Next.js の制約）ため、
 * actions/mappings.ts から本ファイルへ切り出している。
 */
export function normalizeStoreName(s: string): string {
  return s.normalize("NFKC").trim();
}
