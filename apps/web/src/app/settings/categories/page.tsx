import { query } from "@/lib/apollo-client";
import { gql } from "@apollo/client";
import { CategoryManagementContent } from "@/components/category-management-content";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

const CATEGORIES_PAGE_QUERY = gql`
  query CategoriesPage {
    categories {
      id
      name
      categoryType
      color
      children {
        id
        name
        categoryType
        color
      }
    }
  }
`;

type CategoryData = {
  id: string;
  name: string;
  categoryType: string;
  color?: string | null;
  children: CategoryData[];
};

type CategoriesPageData = {
  categories: CategoryData[];
};

export default async function CategoriesPage() {
  const { data } = await query<CategoriesPageData>({
    query: CATEGORIES_PAGE_QUERY,
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
          <h1 className="text-2xl font-bold text-foreground mt-1">カテゴリ管理</h1>
        </header>

        <CategoryManagementContent initialCategories={data.categories} />
      </div>
    </main>
  );
}
