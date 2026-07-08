import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { signSession, AUTH_COOKIE_NAME } from "@/lib/auth";
import { proxy } from "./proxy";

const SECRET = "proxy-test-secret";
const ORIGINAL_SECRET = process.env.AUTH_COOKIE_SECRET;

beforeEach(() => {
  process.env.AUTH_COOKIE_SECRET = SECRET;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_COOKIE_SECRET;
  else process.env.AUTH_COOKIE_SECRET = ORIGINAL_SECRET;
});

describe("proxy", () => {
  it("cookie未設定なら /login にリダイレクトする", async () => {
    const req = new NextRequest("https://example.com/");
    const res = await proxy(req);
    expect(res.headers.get("location")).toBe("https://example.com/login");
  });

  it("不正なcookieなら /login にリダイレクトする", async () => {
    const req = new NextRequest("https://example.com/settings", {
      headers: { cookie: `${AUTH_COOKIE_NAME}=garbage` },
    });
    const res = await proxy(req);
    expect(res.headers.get("location")).toBe("https://example.com/login");
  });

  it("有効なcookieなら通過する（リダイレクトしない）", async () => {
    const token = await signSession(Date.now(), SECRET);
    const req = new NextRequest("https://example.com/settings", {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
    });
    const res = await proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("AUTH_COOKIE_SECRET が未設定なら有効なトークンでもリダイレクトする", async () => {
    const token = await signSession(Date.now(), SECRET);
    delete process.env.AUTH_COOKIE_SECRET;
    const req = new NextRequest("https://example.com/", {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
    });
    const res = await proxy(req);
    expect(res.headers.get("location")).toBe("https://example.com/login");
  });

  it("matcher の除外設定に加え、関数内でも /login は cookie 無しで通過する（二重防御）", async () => {
    const req = new NextRequest("https://example.com/login");
    const res = await proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("matcher の除外設定に加え、関数内でも /api/inbound-email は cookie 無しで通過する（二重防御）", async () => {
    const req = new NextRequest("https://example.com/api/inbound-email", { method: "POST" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });
});
