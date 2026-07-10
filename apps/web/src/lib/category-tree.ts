import { eq } from "drizzle-orm";
import type { Db } from "@/db/schema";
import { categories } from "@/db/schema";

export type CategoryTreeRow = {
  id: string;
  name: string;
  kind: "fixed" | "variable";
  color: string | null;
  sortOrder: number;
  parentId: string | null;
};

export type CategoryNode = {
  id: string;
  name: string;
  kind: "fixed" | "variable";
  color: string | null;
  children: { id: string; name: string }[];
};

/** フラット行を親（sortOrder→id順）＞子（同順）のツリーへ変換する純粋関数。client からも import 可 */
export function buildCategoryTree(rows: CategoryTreeRow[]): CategoryNode[] {
  const byOrder = (a: CategoryTreeRow, b: CategoryTreeRow) =>
    a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id);
  const parents = rows.filter((r) => r.parentId == null).sort(byOrder);
  return parents.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    color: p.color,
    children: rows
      .filter((r) => r.parentId === p.id)
      .sort(byOrder)
      .map((c) => ({ id: c.id, name: c.name })),
  }));
}

/** カテゴリの階層役割。割当先バリデーション（取引・マッピング=child / 予算・アラート=parent）に使う */
export async function getCategoryRole(db: Db, id: number): Promise<"parent" | "child" | null> {
  const row = (
    await db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, id)).limit(1)
  )[0];
  if (!row) return null;
  return row.parentId == null ? "parent" : "child";
}

/** 親配下の集計対象カテゴリid（親自身+全子）。予算・ペースの spent 集計はこの集合で行う */
export async function getAlertTargetCategoryIds(db: Db, parentId: number): Promise<number[]> {
  const children = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, parentId));
  return [parentId, ...children.map((c) => c.id)];
}
