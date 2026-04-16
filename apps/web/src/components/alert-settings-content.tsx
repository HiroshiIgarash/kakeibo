"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { AlertSettingKind } from "@/gql/graphql";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type UpsertAlertSettingData = {
  upsertAlertSetting: {
    budgetAlertSetting?: {
      id: string;
      threshold: number;
      threshold2?: number | null;
      isActive: boolean;
    } | null;
    paceAlertSetting?: {
      id: string;
      threshold: number;
      activeFromDay: number;
      isActive: boolean;
    } | null;
    errors: string[];
  };
};

const UPSERT_ALERT_SETTING = gql`
  mutation UpsertAlertSettingMutation($input: UpsertAlertSettingInput!) {
    upsertAlertSetting(input: $input) {
      budgetAlertSetting {
        id
        threshold
        threshold2
        isActive
      }
      paceAlertSetting {
        id
        threshold
        activeFromDay
        isActive
      }
      errors
    }
  }
`;

type BudgetAlertSettingData = {
  id: string;
  categoryId?: string | null;
  threshold: number;
  threshold2?: number | null;
  isActive: boolean;
  category?: { id: string; name: string } | null;
};

type PaceAlertSettingData = {
  id: string;
  categoryId: string;
  threshold: number;
  activeFromDay: number;
  isActive: boolean;
  category: { id: string; name: string };
};

type CategoryData = {
  id: string;
  name: string;
};

type Props = {
  budgetAlertSettings: BudgetAlertSettingData[];
  paceAlertSettings: PaceAlertSettingData[];
  categories: CategoryData[];
};

// 保存結果の一時表示用
type SaveStatus = "idle" | "saving" | "saved" | "error" | "invalid";

// ────────────────────────────────────────────────────────────────
// 予算アラート行（1カテゴリ分）
// ────────────────────────────────────────────────────────────────
function BudgetAlertRow({
  label,
  categoryId,
  existing,
}: {
  label: string;
  categoryId: string | null;
  existing?: BudgetAlertSettingData;
}) {
  const [threshold, setThreshold] = useState(
    existing?.threshold?.toString() ?? "80"
  );
  const [threshold2, setThreshold2] = useState(
    existing?.threshold2?.toString() ?? ""
  );
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const [upsert] = useMutation<UpsertAlertSettingData>(UPSERT_ALERT_SETTING);

  function handleSave() {
    const t1 = parseInt(threshold, 10);
    const t2 = threshold2.trim() !== "" ? parseInt(threshold2, 10) : undefined;
    if (isNaN(t1) || t1 < 1 || t1 > 200) { setStatus("invalid"); return; }
    if (t2 !== undefined && (isNaN(t2) || t2 < 1 || t2 > 200)) { setStatus("invalid"); return; }
    if (t2 !== undefined && t2 <= t1) { setStatus("invalid"); return; }

    setStatus("saving");
    upsert({
      variables: {
        input: {
          settingType: AlertSettingKind.Budget,
          categoryId: categoryId ?? undefined,
          threshold: t1,
          threshold2: t2 ?? null,
          isActive,
        },
      },
      onCompleted(data) {
        if (!mountedRef.current) return;
        const errors = data?.upsertAlertSetting?.errors ?? [];
        setStatus(errors.length > 0 ? "error" : "saved");
        setTimeout(() => { if (mountedRef.current) setStatus("idle"); }, 2000);
      },
      onError() {
        if (!mountedRef.current) return;
        setStatus("error");
        setTimeout(() => { if (mountedRef.current) setStatus("idle"); }, 2000);
      },
    });
  }

  return (
    <Card className="py-0">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-card-foreground">{label}</span>
          <button
            type="button"
            onClick={() => setIsActive((v) => !v)}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none",
              isActive ? "bg-emerald-500" : "bg-muted"
            )}
            aria-label={isActive ? "有効" : "無効"}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                isActive ? "translate-x-4.5" : "translate-x-0.5"
              )}
            />
          </button>
        </div>

        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">閾値1（%）</span>
            <input
              type="number"
              min={1}
              max={200}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="80"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">閾値2（%、任意）</span>
            <input
              type="number"
              min={1}
              max={200}
              value={threshold2}
              onChange={(e) => setThreshold2(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="100"
            />
          </label>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={status === "saving"}
            className={cn(
              "shrink-0",
              status === "saved" && "bg-emerald-500 hover:bg-emerald-500"
            )}
          >
            {status === "saving" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : status === "saved" ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              "保存"
            )}
          </Button>
        </div>

        {status === "invalid" && (
          <p className="text-xs text-red-500">閾値1は1〜200%、閾値2は閾値1より大きい値を入力してください</p>
        )}
        {status === "error" && (
          <p className="text-xs text-red-500">保存に失敗しました</p>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
// ペースアラート行（1カテゴリ分）
// ────────────────────────────────────────────────────────────────
function PaceAlertRow({
  category,
  existing,
}: {
  category: CategoryData;
  existing?: PaceAlertSettingData;
}) {
  const [threshold, setThreshold] = useState(
    existing?.threshold?.toString() ?? "110"
  );
  const [activeFromDay, setActiveFromDay] = useState(
    existing?.activeFromDay?.toString() ?? "5"
  );
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const [upsert] = useMutation<UpsertAlertSettingData>(UPSERT_ALERT_SETTING);

  function handleSave() {
    const t = parseInt(threshold, 10);
    const day = parseInt(activeFromDay, 10);
    if (isNaN(t) || t < 101 || t > 500) { setStatus("invalid"); return; }
    if (isNaN(day) || day < 1 || day > 28) { setStatus("invalid"); return; }

    setStatus("saving");
    upsert({
      variables: {
        input: {
          settingType: AlertSettingKind.Pace,
          categoryId: category.id,
          threshold: t,
          activeFromDay: day,
          isActive,
        },
      },
      onCompleted(data) {
        if (!mountedRef.current) return;
        const errors = data?.upsertAlertSetting?.errors ?? [];
        setStatus(errors.length > 0 ? "error" : "saved");
        setTimeout(() => { if (mountedRef.current) setStatus("idle"); }, 2000);
      },
      onError() {
        if (!mountedRef.current) return;
        setStatus("error");
        setTimeout(() => { if (mountedRef.current) setStatus("idle"); }, 2000);
      },
    });
  }

  return (
    <Card className="py-0">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-card-foreground">{category.name}</span>
          <button
            type="button"
            onClick={() => setIsActive((v) => !v)}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none",
              isActive ? "bg-emerald-500" : "bg-muted"
            )}
            aria-label={isActive ? "有効" : "無効"}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                isActive ? "translate-x-4.5" : "translate-x-0.5"
              )}
            />
          </button>
        </div>

        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">ペース閾値（%、100超）</span>
            <input
              type="number"
              min={101}
              max={500}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="110"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">開始日（日以降）</span>
            <input
              type="number"
              min={1}
              max={28}
              value={activeFromDay}
              onChange={(e) => setActiveFromDay(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="5"
            />
          </label>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={status === "saving"}
            className={cn(
              "shrink-0",
              status === "saved" && "bg-emerald-500 hover:bg-emerald-500"
            )}
          >
            {status === "saving" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : status === "saved" ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              "保存"
            )}
          </Button>
        </div>

        {status === "invalid" && (
          <p className="text-xs text-red-500">閾値は101〜500%、開始日は1〜28日の範囲で入力してください</p>
        )}
        {status === "error" && (
          <p className="text-xs text-red-500">保存に失敗しました</p>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────────────
export function AlertSettingsContent({
  budgetAlertSettings,
  paceAlertSettings,
  categories,
}: Props) {
  // カテゴリID → 既存設定のマップ
  const budgetMap = new Map(
    budgetAlertSettings
      .filter((s) => s.categoryId != null)
      .map((s) => [s.categoryId!, s])
  );
  const overallBudget = budgetAlertSettings.find((s) => s.categoryId == null);
  const paceMap = new Map(paceAlertSettings.map((s) => [s.categoryId, s]));

  return (
    <div className="flex flex-col gap-8">
      {/* 予算アラート */}
      <section>
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          予算アラート
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          予算に対する使用率が閾値を超えると通知メールを送信します。月が変わるとリセットされます。
        </p>
        <div className="flex flex-col gap-3">
          <BudgetAlertRow
            key="budget-overall"
            label="全体"
            categoryId={null}
            existing={overallBudget}
          />
          {categories.map((cat) => (
            <BudgetAlertRow
              key={cat.id}
              label={cat.name}
              categoryId={cat.id}
              existing={budgetMap.get(cat.id)}
            />
          ))}
        </div>
      </section>

      {/* ペースアラート */}
      <section>
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          ペースアラート
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          日割りペースに対する超過率が閾値を超えると通知します。GREEN → RED に変わった瞬間のみ送信します。
        </p>
        <div className="flex flex-col gap-3">
          {categories.map((cat) => (
            <PaceAlertRow
              key={cat.id}
              category={cat}
              existing={paceMap.get(cat.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
