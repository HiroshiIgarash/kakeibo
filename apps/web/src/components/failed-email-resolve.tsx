"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveFailedInboundEmail, ignoreFailedInboundEmail } from "@/actions/inbound-emails";
import type { FailedInboundEmailView } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Loader2, MailWarning } from "lucide-react";

// ────────────────────────────────────────────────────────────────
// 失敗メール行（展開して金額入力→登録 / 無視）
// ────────────────────────────────────────────────────────────────
function FailedRow({ email, open, onToggle }: { email: FailedInboundEmailView; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [storeName, setStoreName] = useState(email.storeName ?? "");
  const [date, setDate] = useState(email.date ?? email.receivedAt);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleResolve() {
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) {
      setError("実際に引き落とされた金額（円・整数）を入力してください");
      return;
    }
    setError(null);
    setBusy(true);
    const result = await resolveFailedInboundEmail({ id: email.id, amount: n, storeName, date });
    setBusy(false);
    if (result.errors.length > 0) {
      setError(result.errors.join(", "));
      return;
    }
    router.refresh();
  }

  async function handleIgnore() {
    setError(null);
    setBusy(true);
    const result = await ignoreFailedInboundEmail({ id: email.id });
    setBusy(false);
    if (result.errors.length > 0) {
      setError(result.errors.join(", "));
      return;
    }
    router.refresh();
  }

  return (
    <div className="px-4 py-3">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-card-foreground truncate">
            {email.storeName ?? email.subject ?? "（店名不明）"}
          </p>
          <p className="text-xs text-muted-foreground">
            {email.date ?? email.receivedAt}
            {email.amountRaw && ` / 元の表記: ${email.amountRaw}`}
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-2 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-10">金額</span>
            <span className="text-xs text-muted-foreground">¥</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="実際の引落額"
              className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-10">店名</span>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-10">日付</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleIgnore}>
              無視
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={handleResolve}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "登録"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────────────
export function FailedEmailResolve({ emails }: { emails: FailedInboundEmailView[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (emails.length === 0) return null;

  return (
    <Card className="py-0 gap-0 border-red-300/60">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MailWarning className="w-4 h-4 text-red-500" />
        <p className="text-sm font-semibold text-card-foreground">取り込みに失敗したメール</p>
        <span className="text-[10px] font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
          {emails.length}件
        </span>
      </div>
      <p className="px-4 pt-3 text-xs text-muted-foreground">
        金額を読み取れなかったメールです。三井住友のアプリ等で実際の引落額（円）を確認して登録してください。
      </p>
      <CardContent className="p-0 divide-y divide-border">
        {emails.map((e) => (
          <FailedRow
            key={e.id}
            email={e}
            open={openId === e.id}
            onToggle={() => setOpenId((v) => (v === e.id ? null : e.id))}
          />
        ))}
      </CardContent>
    </Card>
  );
}
