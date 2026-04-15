"use client";

import { Button } from "@/components/ui/button";

/**
 * ホーム画面のエラー境界。
 * Server Component 内で throw されたエラー（APIサーバーダウン等）を受け止め、
 * ユーザーに再試行ボタンを提示する。
 * Next.js の規約により "use client" が必須。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 text-center flex flex-col gap-4">
        <p className="text-sm font-medium text-muted-foreground">データを読み込めませんでした</p>
        {process.env.NODE_ENV === "development" && (
          <p className="text-xs text-muted-foreground/60">{error.message}</p>
        )}
        <Button variant="secondary" onClick={reset} className="self-center">
          再試行
        </Button>
      </div>
    </main>
  );
}
