import { CircleAlert, Tag, TrendingUp, MailWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { NotificationView } from "@/lib/notifications";

/**
 * 未読通知リスト。
 * notifiable の __typename で BudgetAlert / PaceAlert / UnclassifiedAlert / InboundEmail を判別し、
 * それぞれ異なるアイコンとスタイルで表示する。
 */

type NotificationItem = NotificationView;
type Props = { notifications: NotificationItem[] };

function NotificationRow({ item }: { item: NotificationItem }) {
  const { notifiable } = item;

  if (notifiable.__typename === "BudgetAlert") {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertDescription>
          <span className="font-medium">{notifiable.category.name}</span> の予算が{" "}
          <span className="font-medium">{notifiable.usagePercent}%</span> に達しました
          （閾値: {notifiable.threshold}%）
        </AlertDescription>
      </Alert>
    );
  }

  if (notifiable.__typename === "PaceAlert") {
    return (
      <Alert className={cn("border-amber-300 bg-amber-50 text-amber-800", "*:[svg]:text-amber-600")}>
        <TrendingUp />
        <AlertDescription className="text-amber-700">
          <span className="font-medium">{notifiable.category.name}</span> のペースが想定を超えています
        </AlertDescription>
      </Alert>
    );
  }

  if (notifiable.__typename === "InboundEmail") {
    return (
      <Alert variant="destructive">
        <MailWarning />
        <AlertDescription>
          メールの取り込みに失敗しました
          {notifiable.subject ? <>（{notifiable.subject}）</> : null}
          {notifiable.errorMessage ? <span className="block text-xs opacity-80">{notifiable.errorMessage}</span> : null}
        </AlertDescription>
      </Alert>
    );
  }

  // UnclassifiedAlert（網羅性のため明示チェック）
  if (notifiable.__typename === "UnclassifiedAlert") {
    return (
      <Alert>
        <Tag />
        <AlertDescription>
          未分類の支出が <span className="font-medium">{notifiable.count}件</span> あります
        </AlertDescription>
      </Alert>
    );
  }

  // 想定外の notifiable_type は開発時に気づけるよう never チェック
  return null;
}

export function NotificationList({ notifications }: Props) {
  return (
    <div>
      <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
        通知
      </h2>
      <div className="flex flex-col gap-2">
        {notifications.map((item) => (
          <NotificationRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
