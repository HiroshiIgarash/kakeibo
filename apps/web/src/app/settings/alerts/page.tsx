import { query } from "@/lib/apollo-client";
import { gql } from "@apollo/client";
import { AlertSettingsContent } from "@/components/alert-settings-content";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

const ALERT_SETTINGS_PAGE_QUERY = gql`
  query AlertSettingsPage {
    alertSettings {
      budgetAlertSettings {
        id
        categoryId
        threshold
        threshold2
        isActive
        category {
          id
          name
        }
      }
      paceAlertSettings {
        id
        categoryId
        threshold
        activeFromDay
        isActive
        category {
          id
          name
        }
      }
    }
    categories {
      id
      name
    }
  }
`;

type AlertSettingsPageData = {
  alertSettings: {
    budgetAlertSettings: Array<{
      id: string;
      categoryId?: string | null;
      threshold: number;
      threshold2?: number | null;
      isActive: boolean;
      category?: { id: string; name: string } | null;
    }>;
    paceAlertSettings: Array<{
      id: string;
      categoryId: string;
      threshold: number;
      activeFromDay: number;
      isActive: boolean;
      category: { id: string; name: string };
    }>;
  };
  categories: Array<{ id: string; name: string }>;
};

export default async function AlertSettingsPage() {
  const { data } = await query<AlertSettingsPageData>({
    query: ALERT_SETTINGS_PAGE_QUERY,
  });

  if (!data) throw new Error("データの取得に失敗しました");

  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
        <header>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3 -ml-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            設定に戻る
          </Link>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Settings
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">アラート設定</h1>
        </header>

        <AlertSettingsContent
          budgetAlertSettings={data.alertSettings.budgetAlertSettings}
          paceAlertSettings={data.alertSettings.paceAlertSettings}
          categories={data.categories}
        />
      </div>
    </main>
  );
}
