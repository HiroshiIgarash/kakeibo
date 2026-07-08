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
      onClick={onToggle}
      disabled={saving}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none disabled:opacity-50",
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
