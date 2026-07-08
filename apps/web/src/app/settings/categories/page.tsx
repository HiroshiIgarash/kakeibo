import { db } from "@/db/client";
import { loadCategories } from "@/lib/queries";
import { CategoryManagementContent } from "@/components/category-management-content";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

// DB を参照する RSC のため、build 時の静的評価を避けて常にリクエスト時に描画する
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await loadCategories(db);

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
          <h1 className="text-2xl font-bold text-foreground mt-1">カテゴリ管理</h1>
        </header>

        <CategoryManagementContent initialCategories={categories} />
      </div>
    </main>
  );
}
