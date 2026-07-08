"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, AUTH_MAX_AGE_SECONDS, signSession } from "@/lib/auth";

export type LoginState = { error: string | null };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.AUTH_PASSWORD ?? "";
  const secret = process.env.AUTH_COOKIE_SECRET ?? "";

  if (expected === "" || secret === "") {
    return { error: "サーバーの認証設定が未構成です" };
  }
  if (password !== expected) {
    return { error: "パスワードが違います" };
  }

  const token = await signSession(Date.now(), secret);
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE_SECONDS,
  });
  redirect("/");
}
