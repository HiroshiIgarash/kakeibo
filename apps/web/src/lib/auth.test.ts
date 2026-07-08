import { describe, it, expect } from "vitest";
import { signSession, verifySession, AUTH_MAX_AGE_SECONDS } from "./auth";

const SECRET = "test-secret-key";

describe("session signing", () => {
  it("署名したトークンは検証を通る", async () => {
    const now = Date.now();
    const token = await signSession(now, SECRET);
    expect(await verifySession(token, SECRET, now)).toBe(true);
  });

  it("改竄されたトークンは拒否する", async () => {
    const token = await signSession(Date.now(), SECRET);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(await verifySession(tampered, SECRET)).toBe(false);
  });

  it("異なる secret では検証に失敗する", async () => {
    const token = await signSession(Date.now(), SECRET);
    expect(await verifySession(token, "other-secret")).toBe(false);
  });

  it("有効期限切れは拒否する", async () => {
    const issuedAt = Date.now() - (AUTH_MAX_AGE_SECONDS + 10) * 1000;
    const token = await signSession(issuedAt, SECRET);
    expect(await verifySession(token, SECRET)).toBe(false);
  });

  it("不正な形式のトークンは false を返す（throw しない）", async () => {
    expect(await verifySession("garbage", SECRET)).toBe(false);
    expect(await verifySession("", SECRET)).toBe(false);
  });
});
