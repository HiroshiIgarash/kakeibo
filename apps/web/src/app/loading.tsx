import { Card, CardContent } from "@/components/ui/card";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} aria-hidden />;
}

/**
 * 全ルート共通のローディングスケルトン。
 * force-dynamic なページの取得完了までブランク画面になるのを防ぐ。
 */
export default function Loading() {
  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6" aria-busy="true">
        <header>
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-2 h-7 w-32" />
        </header>
        <Card className="py-0">
          <CardContent className="p-6 flex flex-col gap-4">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-9 w-40" />
            <SkeletonBlock className="h-2 w-full" />
            <div className="flex justify-between">
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          </CardContent>
        </Card>
        {[0, 1].map((i) => (
          <Card key={i} className="py-0">
            <CardContent className="p-4 flex flex-col gap-3">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-6 w-32" />
              <SkeletonBlock className="h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
