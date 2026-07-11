import { Bell, Tag, GitBranch, Wallet, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import Link from "next/link";

type SettingsSection = {
  label: string;
  icon: React.ElementType;
  description: string;
  href?: string;
};

// 依存関係順（予算・アラート・マッピングはカテゴリの登録が前提）
const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    label: "カテゴリ管理",
    icon: Tag,
    description: "カテゴリの追加・編集・削除",
    href: "/settings/categories",
  },
  {
    label: "予算設定",
    icon: Wallet,
    description: "カテゴリごとの月次予算を設定",
    href: "/settings/budgets",
  },
  {
    label: "アラート設定",
    icon: Bell,
    description: "予算・ペースアラートのしきい値を設定",
    href: "/settings/alerts",
  },
  {
    label: "マッピング管理",
    icon: GitBranch,
    description: "店名とカテゴリの自動分類ルール",
    href: "/settings/mappings",
  },
];

export default function SettingsPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
        <header>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Settings
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">設定</h1>
        </header>

        <Card className="divide-y divide-border py-0 gap-0">
          {SETTINGS_SECTIONS.map(({ label, icon: Icon, description, href }) => {
            const content = (
              <>
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-card-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
                {href ? (
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
                    準備中
                  </span>
                )}
              </>
            );

            return href ? (
              <Link
                key={label}
                href={href}
                className="flex items-center gap-4 px-4 py-4 hover:bg-muted/50 transition-colors"
              >
                {content}
              </Link>
            ) : (
              <div
                key={label}
                className="flex items-center gap-4 px-4 py-4 opacity-50"
                aria-disabled="true"
                role="listitem"
              >
                {content}
              </div>
            );
          })}
        </Card>
      </div>
    </main>
  );
}
