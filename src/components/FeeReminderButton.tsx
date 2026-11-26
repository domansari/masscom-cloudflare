import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { receiptPhone } from "@/lib/receipt-phone.js";

type Failure = { period: string; error: string };
type Props = {
  studentId: string;
  studentName: string;
  phone: string;
  periodLabel: string;
  amount: number;
  installmentCount?: number;
  planItemId?: string;
  compact?: boolean;
};

const currency = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(value);

export default function FeeReminderButton({
  studentId,
  studentName,
  phone,
  periodLabel,
  amount,
  installmentCount = 1,
  planItemId,
  compact = false,
}: Props) {
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const normalizedPhone = receiptPhone(phone);

  async function send() {
    if (!normalizedPhone || sending) return;
    const description = planItemId
      ? periodLabel + " · " + currency(amount)
      : installmentCount + " overdue fee period(s) · " + periodLabel + " · " + currency(amount);
    if (!window.confirm(
      "Send the WhatsApp API fee reminder to " + studentName + " at +" + normalizedPhone + "?\n" +
      description + (planItemId ? "" : "\nA separate message will be sent for each overdue period.")
    )) return;

    setSending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/whatsapp/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId, ...(planItemId ? { plan_item_id: planItemId } : {}) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) throw new Error(result.error || "Meta did not accept the fee reminder.");
      const accepted = Number(result.accepted_count || 0);
      const processed = Number(result.processed_count || installmentCount);
      let message = accepted + " of " + processed + " message(s) accepted by Meta. Delivery is not confirmed.";
      if (Array.isArray(result.failures) && result.failures.length) {
        message += " " + result.failures.map((failure: Failure) => failure.period + ": " + failure.error).join("; ");
      }
      setStatus({ kind: result.failures?.length ? "error" : "success", message });
    } catch (cause) {
      setStatus({ kind: "error", message: cause instanceof Error ? cause.message : "Could not send the fee reminder." });
    } finally {
      setSending(false);
    }
  }

  if (!normalizedPhone) return <span className="text-xs text-gray-400">No valid WhatsApp number</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={sending}
        onClick={() => void send()}
        className={compact
          ? "inline-flex shrink-0 items-center gap-1 rounded-md bg-green-700/80 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"
          : "inline-flex items-center gap-2 rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"}
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        {sending ? "Sending…" : "WhatsApp API"}
      </button>
      {status && <p role="status" className={`max-w-xs text-right text-xs ${status.kind === "error" ? "text-rose-200" : "text-emerald-200"}`}>{status.message}</p>}
    </div>
  );
}
