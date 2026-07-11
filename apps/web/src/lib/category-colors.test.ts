import { describe, it, expect } from "vitest";
import { PRESET_COLORS, pickUnusedColor } from "./category-colors";

describe("PRESET_COLORS", () => {
  it("10色のプリセットを持つ", () => {
    expect(PRESET_COLORS).toHaveLength(10);
  });
});

describe("pickUnusedColor", () => {
  it("使用済みなしなら先頭色を返す", () => {
    expect(pickUnusedColor([])).toBe(PRESET_COLORS[0]);
  });

  it("使用済みを飛ばして最初の未使用色を返す", () => {
    expect(pickUnusedColor([PRESET_COLORS[0], PRESET_COLORS[1]])).toBe(PRESET_COLORS[2]);
  });

  it("順不同の使用済みでも正しく判定する", () => {
    expect(pickUnusedColor([PRESET_COLORS[1]])).toBe(PRESET_COLORS[0]);
  });

  it("全色使用済みなら先頭色を返す", () => {
    expect(pickUnusedColor([...PRESET_COLORS])).toBe(PRESET_COLORS[0]);
  });

  it("null（色未設定の親）は無視する", () => {
    expect(pickUnusedColor([null, PRESET_COLORS[0]])).toBe(PRESET_COLORS[1]);
  });

  it("プリセット外の色は判定に影響しない", () => {
    expect(pickUnusedColor(["#000000"])).toBe(PRESET_COLORS[0]);
  });
});
