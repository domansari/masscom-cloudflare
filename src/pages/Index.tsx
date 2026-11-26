import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarClock, Clock, Database, FileText, IndianRupee, MessageCircle, RefreshCw, Shield, Users, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { receiptPhone } from "@/lib/receipt-phone.js";

type FeeDue = {
  student_id: string;
  student_name: string;
  father_name: string;
  phone: string;
  roll_no: string;
  course_name: string;
  fee_category: string;
  period: string;
  due_date: string;
  remaining_amount: number;
  items?: Array<{ fee_category: string; period: string; due_date: string; remaining_amount: number }>;
};

type FeeSummary = {
  today: string;
  today_collection: number;
  today_receipts: number;
  month_collection: number;
  month_receipts: number;
  overdue_amount: number;
  overdue_students: number;
  overdue_items: FeeDue[];
  upcoming_amount: number;
  upcoming_students: number;
  upcoming_items: FeeDue[];
};

const currency = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(amount);

function hasWhatsAppNumber(phone: string) {
  return Boolean(receiptPhone(phone));
}

function FeeOverview() {
  const [summary, setSummary] = useState<FeeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [sendingStudentId, setSendingStudentId] = useState("");
  const [reminderStatus, setReminderStatus] = useState<Record<string, { kind: "sending" | "success" | "error"; message: string }>>({});

  const loadSummary = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/fees/summary", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "फीस का सारांश लोड नहीं हो पाया।");
      setSummary(result.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "फीस का सारांश लोड नहीं हो पाया।");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  async function sendFeeReminder(item: FeeDue) {
    if (sendingStudentId || !hasWhatsAppNumber(item.phone)) return;
    const installmentCount = item.items?.length || 1;
    const confirmed = window.confirm(
      "Send the WhatsApp fee reminder to " + item.student_name + " at +" + receiptPhone(item.phone) + "?\n" +
      "Overdue: " + item.period + " · Total outstanding: " + currency(item.remaining_amount) + ".\n" +
      "A separate template message will be sent for each overdue fee period."
    );
    if (!confirmed) return;

    setSendingStudentId(item.student_id);
    setReminderStatus(current => ({ ...current, [item.student_id]: { kind: "sending", message: "Sending through WhatsApp API…" } }));
    try {
      const response = await fetch("/api/whatsapp/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: item.student_id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) throw new Error(result.error || "Meta did not accept the fee reminder.");
      const accepted = Number(result.accepted_count || 0);
      let message = accepted + " of " + installmentCount + " reminder(s) accepted by Meta. Delivery is not confirmed.";
      if (result.failures?.length) message += " Failed: " + result.failures.map((failure: { period: string; error: string }) => failure.period + " — " + failure.error).join("; ");
      setReminderStatus(current => ({ ...current, [item.student_id]: { kind: result.failures?.length ? "error" : "success", message } }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not send the fee reminder.";
      setReminderStatus(current => ({ ...current, [item.student_id]: { kind: "error", message } }));
    } finally {
      setSendingStudentId("");
    }
  }

  const metrics = summary ? [
    { label: "आज की वसूली", amount: summary.today_collection, detail: `${summary.today_receipts} रसीदें`, color: "text-emerald-200" },
    { label: "इस महीने की वसूली", amount: summary.month_collection, detail: `${summary.month_receipts} रसीदें`, color: "text-cyan-200" },
    { label: "कुल बकाया", amount: summary.overdue_amount, detail: `${summary.overdue_students} छात्र`, color: "text-rose-200" },
    { label: "अगले 7 दिन में देय", amount: summary.upcoming_amount, detail: `${summary.upcoming_students} छात्र`, color: "text-amber-200" },
  ] : [];

  return (
    <section className="mx-auto mb-8 max-w-6xl rounded-2xl border border-white/20 bg-slate-950/55 p-4 shadow-xl backdrop-blur-lg sm:p-6" aria-labelledby="fee-overview-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="fee-overview-title" className="text-xl font-semibold text-white">फीस का आज का सारांश</h2>
          <p className="mt-1 text-sm text-gray-300">आज और इस महीने की वसूली, बकाया तथा आने वाली फीस</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadSummary(true)} disabled={loading || refreshing} className="inline-flex items-center gap-2 rounded-md border border-white/25 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" /> ताज़ा करें
          </button>
          <Link to="/fees" className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600">फीस लें</Link>
        </div>
      </div>

      {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-300/30 bg-rose-950/40 p-3 text-sm text-rose-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {loading && !summary ? <p className="py-8 text-center text-sm text-gray-300">फीस का सारांश लोड हो रहा है…</p> : summary && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(metric => <div key={metric.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-gray-300">{metric.label}</p>
            <p className={`mt-2 text-2xl font-bold tabular-nums ${metric.color}`}>{currency(metric.amount)}</p>
            <p className="mt-1 text-xs text-gray-400">{metric.detail}</p>
          </div>)}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-200" aria-hidden="true" />
              <h3 className="font-semibold text-white">बकाया फीस</h3>
            </div>
            {summary.overdue_items.length === 0 ? <p className="text-sm text-gray-300">अभी कोई बकाया फीस नहीं है।</p> : <ul className="space-y-2">
              {summary.overdue_items.slice(0, 8).map((item, index) => {
                const hasPhone = hasWhatsAppNumber(item.phone);
                const status = reminderStatus[item.student_id];
                return <li key={`${item.student_id}-${item.due_date}-${item.fee_category}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{item.student_name}</p>
                    <p className="text-xs text-gray-300">{item.period} · देय {item.due_date} · {currency(item.remaining_amount)}</p>
                    {status && <p role="status" className={`mt-1 text-xs ${status.kind === "error" ? "text-rose-200" : status.kind === "success" ? "text-emerald-200" : "text-cyan-200"}`}>{status.message}</p>}
                  </div>
                  {hasPhone ? <button type="button" disabled={Boolean(sendingStudentId)} onClick={() => void sendFeeReminder(item)} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-green-700/80 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60">
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> {sendingStudentId === item.student_id ? "Sending…" : "WhatsApp"}
                  </button> : <span className="text-xs text-gray-400">फोन नंबर उपलब्ध नहीं</span>}
              })}
            </ul>}
            {summary.overdue_students > 8 && <Link to="/fees" className="mt-3 inline-block text-sm font-medium text-rose-100 underline underline-offset-4">बाकी {summary.overdue_students - 8} छात्र फीस पेज पर देखें</Link>}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-200" aria-hidden="true" />
              <h3 className="font-semibold text-white">अगले 7 दिनों में देय</h3>
            </div>
            {summary.upcoming_items.length === 0 ? <p className="text-sm text-gray-300">अगले 7 दिनों में कोई फीस देय नहीं है।</p> : <ul className="space-y-2">
              {summary.upcoming_items.slice(0, 8).map((item, index) => <li key={`${item.student_id}-${item.due_date}-${item.fee_category}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 p-3">
                <div className="min-w-0"><p className="truncate font-medium text-white">{item.student_name}</p><p className="text-xs text-gray-300">{item.period} · {item.due_date}</p></div>
                <span className="shrink-0 text-sm font-semibold text-amber-100">{currency(item.remaining_amount)}</span>
              </li>)}
            </ul>}
            {summary.upcoming_students > 8 && <Link to="/fees" className="mt-3 inline-block text-sm font-medium text-amber-100 underline underline-offset-4">बाकी {summary.upcoming_students - 8} छात्र फीस पेज पर देखें</Link>}
          </div>
        </div>
      </>}
    </section>
  );
}

const clockFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", weekday: "long", day: "2-digit", month: "long", year: "numeric",
});

function DashboardClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card className="border-white/20 bg-white/10 backdrop-blur-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-700 shadow-lg">
          <Clock className="h-8 w-8 text-white" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl text-white">Digital Clock</CardTitle>
        <CardDescription className="text-gray-300">India Standard Time</CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <time className="font-mono text-3xl font-semibold tabular-nums text-white" dateTime={now.toISOString()}>
          {clockFormat.format(now)}
        </time>
        <p className="mt-2 text-sm font-medium text-gray-200">{dateFormat.format(now)}</p>
      </CardContent>
    </Card>
  );
}

const modules: Array<{
  title: string;
  description: string;
  action: string;
  to: string;
  Icon: LucideIcon;
  iconClass: string;
  actionClass: string;
}> = [
  {
    title: "Students",
    description: "Add, search, update, archive, and restore student records.",
    action: "Manage Student Record",
    to: "/students",
    Icon: Users,
    iconClass: "bg-indigo-700",
    actionClass: "bg-indigo-700 hover:bg-indigo-800",
  },
  {
    title: "Manage Fees",
    description: "Collect student fees and manage payment records.",
    action: "Fee Management",
    to: "/fees",
    Icon: IndianRupee,
    iconClass: "bg-gradient-to-br from-emerald-500 to-emerald-700",
    actionClass: "bg-gradient-to-r from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800",
  },
  {
    title: "Mark Sheets",
    description: "Create, find, edit, and download student mark sheets.",
    action: "Manage Marksheet",
    to: "/marksheets",
    Icon: Database,
    iconClass: "bg-gradient-to-br from-cyan-500 to-cyan-700",
    actionClass: "bg-gradient-to-r from-cyan-600 to-cyan-800 hover:from-cyan-700 hover:to-cyan-900",
  },
  {
    title: "Certificates",
    description: "Create new certificates or manage certificates already issued.",
    action: "Manage Certificate",
    to: "/generate",
    Icon: FileText,
    iconClass: "bg-gradient-to-br from-blue-500 to-blue-700",
    actionClass: "bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800",
  },
  {
    title: "Verify Certificate",
    description: "Check a certificate using its QR code or certificate ID.",
    action: "Verify Certificate",
    to: "/verify",
    Icon: Shield,
    iconClass: "bg-gradient-to-br from-green-500 to-green-700",
    actionClass: "bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800",
  },
];

const Index = () => {
  const { isAdmin } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-black/40" />
      <main className="container relative z-10 mx-auto px-4 py-8 sm:py-12">
        <div className="mx-auto mb-7 max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            {isAdmin() && <Link to="/student-notices" className="inline-flex items-center gap-2 rounded-md bg-indigo-700 px-4 py-2 font-medium text-white hover:bg-indigo-600">
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Message Students
            </Link>}
          </div>
          <p className="mt-1 text-sm text-gray-200">Choose a work area to get started.</p>
        </div>
        {isAdmin() && <FeeOverview />}
        <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map(({ title, description, action, to, Icon, iconClass, actionClass }, index) => (
            <Fragment key={to}>
              {index === 4 && <DashboardClock />}
            <Card key={to} className="border-white/20 bg-white/10 backdrop-blur-lg transition-all duration-300 hover:bg-white/15 hover:shadow-xl">
              <Link to={to} className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                <CardHeader className="text-center">
                  <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full shadow-lg ${iconClass}`}>
                    <Icon className="h-8 w-8 text-white" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-xl text-white">{title}</CardTitle>
                  <CardDescription className="text-gray-300">{description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={`w-full rounded-md px-4 py-3 text-center font-medium text-white transition-colors ${actionClass}`}>{action}</div>
                </CardContent>
              </Link>
            </Card>
            </Fragment>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Index;
