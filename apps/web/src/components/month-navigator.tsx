"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { jstToday, jstDateParts } from "@/lib/dates";

type Props = {
  year: number;
  month: number;
  basePath?: "transactions" | "calendar";
};

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function MonthNavigator({ year, month, basePath = "transactions" }: Props) {
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);

  // カテゴリフィルタ等のクエリを月移動後も引き継ぐ
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const suffix = qs ? `?${qs}` : "";

  // 当月判定は JST 固定（実行環境TZに依存させない。Vercel は UTC）
  const nowParts = jstDateParts(jstToday());
  const isCurrentMonth = year === nowParts.year && month === nowParts.month;

  return (
    <div className="flex items-center justify-between">
      <Link
        href={`/${basePath}/${prev.year}/${prev.month}${suffix}`}
        className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        {prev.month}月
      </Link>

      <span className="text-sm font-medium text-foreground">
        {year}年{month}月
      </span>

      {isCurrentMonth ? (
        <div className="w-[72px]" />
      ) : (
        <Link
          href={`/${basePath}/${next.year}/${next.month}${suffix}`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {next.month}月
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
