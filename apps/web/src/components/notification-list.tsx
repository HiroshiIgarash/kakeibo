import { CircleAlert, Tag, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * 未読通知リスト。
 * notifiable の __typename で BudgetAlert / PaceAlert / UnclassifiedAlert を判別し、
 * それぞれ異なるアイコンとスタイルで表示する。
 */

type BudgetAlertNotifiable = {
  __typename: "BudgetAlert";
  category: { name: string };
  threshold: number;
  usagePercent: number;
};

type PaceAlertNotifiable = {
  __typename: "PaceAlert";
  category: { name: string };
  month: string;
};

type UnclassifiedAlertNotifiable = {
  __typename: "UnclassifiedAlert";
  count: number;
};

type Notifiable = BudgetAlertNotifiable | PaceAlertNotifiable | UnclassifiedAlertNotifiable;

type NotificationItem = {
  id: string;
  notifiable: Notifiable;
};

type Props = {
  notifications: NotificationItem[];
};

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

  // UnclassifiedAlert
  return (
    <Alert>
      <Tag />
      <AlertDescription>
        未分類の支出が <span className="font-medium">{notifiable.count}件</span> あります
      </AlertDescription>
    </Alert>
  );
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
