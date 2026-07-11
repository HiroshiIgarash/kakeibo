"use client";

import { cn } from "@/lib/utils";

type Props = {
  enabled: boolean;
  onToggle: () => void;
  saving?: boolean;
};

export function ToggleSwitch({ enabled, onToggle, saving = false }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      disabled={saving}
      className={cn(
        // after:* は見た目 20x36px のまま タップ領域を 44px に広げる透明ヒットエリア
        "relative after:absolute after:content-[''] after:-inset-y-3 after:-inset-x-1 inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
        enabled ? "bg-emerald-500" : "bg-muted"
      )}
      aria-label={enabled ? "有効" : "無効"}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-4.5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
