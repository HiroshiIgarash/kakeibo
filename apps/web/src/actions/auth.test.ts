import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const setMock = vi.fn();
const cookiesMock = vi.fn(async () => ({ set: setMock }));
// next/navigation の redirect() は実際には never を返し、内部で例外を投げて
// レンダリングを中断する。テストでも同じ制御フローを再現する。
const redirectMock = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { login } = await import("./auth");
const { verifySession, AUTH_COOKIE_NAME, AUTH_MAX_AGE_SECONDS } = await import("@/lib/auth");

const ORIGINAL_PASSWORD = process.env.AUTH_PASSWORD;
const ORIGINAL_SECRET = process.env.AUTH_COOKIE_SECRET;

afterAll(() => {
  if (ORIGINAL_PASSWORD === undefined) delete process.env.AUTH_PASSWORD;
  else process.env.AUTH_PASSWORD = ORIGINAL_PASSWORD;
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_COOKIE_SECRET;
  else process.env.AUTH_COOKIE_SECRET = ORIGINAL_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_PASSWORD = "correct-horse";
  process.env.AUTH_COOKIE_SECRET = "action-test-secret";
});

function formDataWithPassword(password: string): FormData {
  const fd = new FormData();
  fd.set("password", password);
  return fd;
}

describe("login", () => {
  it("パスワードが違う場合エラーを返しcookieを発行しない", async () => {
    const result = await login({ error: null }, formDataWithPassword("wrong"));
    expect(result.error).toBe("パスワードが違います");
    expect(setMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("AUTH_PASSWORD が未設定ならエラーを返す", async () => {
    delete process.env.AUTH_PASSWORD;
    const result = await login({ error: null }, formDataWithPassword("anything"));
    expect(result.error).toBe("サーバーの認証設定が未構成です");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("AUTH_COOKIE_SECRET が未設定ならエラーを返す", async () => {
    delete process.env.AUTH_COOKIE_SECRET;
    const result = await login({ error: null }, formDataWithPassword("correct-horse"));
    expect(result.error).toBe("サーバーの認証設定が未構成です");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("正しいパスワードなら署名済みcookieを発行して / にリダイレクトする", async () => {
    await expect(login({ error: null }, formDataWithPassword("correct-horse"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(setMock).toHaveBeenCalledTimes(1);
    const [name, token, opts] = setMock.mock.calls[0];
    expect(name).toBe(AUTH_COOKIE_NAME);
    expect(opts).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_MAX_AGE_SECONDS,
    });
    expect(await verifySession(token, "action-test-secret")).toBe(true);
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
