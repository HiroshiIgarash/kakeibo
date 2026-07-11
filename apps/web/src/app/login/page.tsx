"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/actions/auth";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-xs px-4 flex flex-col gap-6">
        <header className="text-center">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">かけいぼ</p>
          <h1 className="text-2xl font-bold text-foreground mt-1">ログイン</h1>
        </header>
        <form action={formAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">パスワード</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="w-full px-3.5 py-3 rounded-xl border border-border bg-muted/30 text-foreground text-base focus:outline-none focus:border-foreground/25 focus:bg-background transition-colors"
            />
          </label>
          {state.error && (
            <p className="text-xs text-rose-500" aria-live="polite">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full py-3.5 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {pending ? "確認中..." : "ログイン"}
          </button>
        </form>
      </div>
    </main>
  );
}
