"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Receipt, Plus, CalendarDays, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TransactionFormSheet,
} from "@/components/transaction-form-sheet";

function useCurrentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

type NavTab = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
};

function NavItem({ href, icon: Icon, label, active }: NavTab) {
  return (
    <Link
      href={href}
      className="flex-1 flex flex-col items-center justify-center gap-1 h-full"
    >
      <div className="relative flex items-center justify-center">
        {active && (
          <span
            className="absolute -top-2.5 w-1 h-1 rounded-full"
            style={{ backgroundColor: "rgb(184,232,231)" }}
          />
        )}
        <Icon
          className={cn(
            "w-5 h-5 transition-colors",
            active ? "text-foreground" : "text-muted-foreground"
          )}
        />
      </div>
      <span
        className={cn(
          "text-[10px] font-medium tracking-tight transition-colors",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </Link>
  );
}

export function AppShell() {
  const pathname = usePathname();
  const { year, month } = useCurrentYearMonth();
  const [sheetOpen, setSheetOpen] = useState(false);

  const tabs: NavTab[] = [
    {
      href: "/",
      icon: Home,
      label: "ホーム",
      active: pathname === "/",
    },
    {
      href: `/transactions/${year}/${month}`,
      icon: Receipt,
      label: "支出",
      active: pathname.startsWith("/transactions"),
    },
    {
      href: `/calendar/${year}/${month}`,
      icon: CalendarDays,
      label: "カレンダー",
      active: pathname.startsWith("/calendar"),
    },
    {
      href: "/settings",
      icon: Settings,
      label: "設定",
      active: pathname.startsWith("/settings"),
    },
  ];

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="max-w-md mx-auto h-14 flex items-stretch">
          {/* ホーム */}
          <NavItem {...tabs[0]!} />

          {/* 支出 */}
          <NavItem {...tabs[1]!} />

          {/* FAB（中央） */}
          <div className="flex-1 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="w-12 h-12 rounded-full bg-foreground flex items-center justify-center shadow-lg shadow-black/25 -translate-y-3 transition-transform active:scale-95"
              aria-label="支出を追加"
            >
              <Plus className="w-6 h-6 text-background" strokeWidth={2.5} />
            </button>
          </div>

          {/* カレンダー */}
          <NavItem {...tabs[2]!} />

          {/* 設定 */}
          <NavItem {...tabs[3]!} />
        </div>
      </nav>

      <TransactionFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
