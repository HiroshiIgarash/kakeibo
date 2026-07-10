import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createTestDb } from "@/test/db";
import { categories } from "@/db/schema";
import {
  buildCategoryTree,
  getCategoryRole,
  getAlertTargetCategoryIds,
  type CategoryTreeRow,
} from "./category-tree";

const { db, teardown } = await createTestDb();
afterAll(() => teardown());
beforeEach(async () => {
  await db.delete(categories);
});

describe("buildCategoryTree", () => {
  const row = (o: Partial<CategoryTreeRow>): CategoryTreeRow => ({
    id: "1",
    name: "x",
    kind: "variable",
    color: null,
    sortOrder: 0,
    parentId: null,
    ...o,
  });

  it("親をsortOrder順、子を親の下にsortOrder順で入れ子にする", () => {
    const tree = buildCategoryTree([
      row({ id: "10", name: "趣味", sortOrder: 2 }),
      row({ id: "1", name: "食費", sortOrder: 1, color: "#f00" }),
      row({ id: "12", name: "外出", parentId: "1", sortOrder: 2 }),
      row({ id: "11", name: "お菓子", parentId: "1", sortOrder: 1 }),
      row({ id: "13", name: "VTuber", parentId: "10", sortOrder: 1 }),
    ]);
    expect(tree).toEqual([
      {
        id: "1",
        name: "食費",
        kind: "variable",
        color: "#f00",
        children: [
          { id: "11", name: "お菓子" },
          { id: "12", name: "外出" },
        ],
      },
      { id: "10", name: "趣味", kind: "variable", color: null, children: [{ id: "13", name: "VTuber" }] },
    ]);
  });

  it("子がいない親は children: [] になる", () => {
    expect(buildCategoryTree([row({ id: "1", name: "日用品" })])).toEqual([
      { id: "1", name: "日用品", kind: "variable", color: null, children: [] },
    ]);
  });
});

describe("getCategoryRole", () => {
  it("親は 'parent'、子は 'child'、不存在は null", async () => {
    const [parent] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [child] = await db
      .insert(categories)
      .values({ name: "お菓子", kind: "variable", parentId: parent.id })
      .returning();
    expect(await getCategoryRole(db, parent.id)).toBe("parent");
    expect(await getCategoryRole(db, child.id)).toBe("child");
    expect(await getCategoryRole(db, 999999)).toBeNull();
  });
});

describe("getAlertTargetCategoryIds", () => {
  it("親idと全子idを返す", async () => {
    const [parent] = await db.insert(categories).values({ name: "食費", kind: "variable" }).returning();
    const [c1] = await db.insert(categories).values({ name: "お菓子", kind: "variable", parentId: parent.id }).returning();
    const [c2] = await db.insert(categories).values({ name: "外出", kind: "variable", parentId: parent.id }).returning();
    const ids = await getAlertTargetCategoryIds(db, parent.id);
    expect(ids.sort((a, b) => a - b)).toEqual([parent.id, c1.id, c2.id].sort((a, b) => a - b));
  });
});
