import * as React from "react";
import { cn } from "@/lib/utils";

// 共通フォーム部品のベースクラス。
// - text-base(16px): iOS Safari はフォーカスした input の font-size が 16px 未満だと
//   画面全体を自動ズームするため、16px 以上を必須とする
// - bg-transparent: このアプリのテーマは「暗いページ面 + ほぼ白のカード」の反転構成。
//   bg-background をカード内で使うと黒地に黒文字になるため、面の色を透過で継承する
// - py-2.5: 高さ約44pxを確保する（Apple HIG のタップ領域推奨）
export const inputBaseClass =
  "rounded-md border border-input bg-transparent px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn("w-full", inputBaseClass, className)} {...props} />;
}

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn("w-full", inputBaseClass, className)} {...props} />;
}

export { Input, NativeSelect };
