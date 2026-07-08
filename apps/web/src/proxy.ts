import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifySession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/inbound-email"];

export async function proxy(request: NextRequest) {
  // 二重防御: matcher の除外設定に加え、関数内でも公開パスを判定する
  // （matcher の設定ミス・将来の変更で /login や /api/inbound-email が
  //   意図せずゲートされることを防ぐ）
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_COOKIE_SECRET ?? "";
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? "";
  const authed = token !== "" && secret !== "" && (await verifySession(token, secret));
  if (authed) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // /login, /api/inbound-email, Next 内部・静的ファイルを除外（spec §7）
  matcher: ["/((?!login|api/inbound-email|_next/static|_next/image|favicon.ico).*)"],
};
