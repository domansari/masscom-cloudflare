import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Clock, Database, FileText, IndianRupee, MessageCircle, RefreshCw, Shield, Users, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type FeeDashboardSummary = {
  today_collection: number;
  today_receipts: number;
  month_collection: number;
  month_receipts: number;
  overdue_amount: number;
  overdue_students: number;
  upcoming_amount: number;
  upcoming_students: number;
};

const currency = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(amount);

function FeeDashboardOverview() {
  const [summary, setSummary] = useState<FeeDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/fees/summary?include_items=0", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "फीस का सारांश लोड नहीं हो पाया।");
      setSummary(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "फीस का सारांश लोड नहीं हो पाया।");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const overdue = Number(summary?.overdue_amount || 0);
  const upcoming = Number(summary?.upcoming_amount || 0);
  const totalDue = overdue + upcoming;
  const overduePercent = totalDue > 0 ? Math.round((overdue / totalDue) * 100) : 0;
  const pieStyle = totalDue > 0
    ? { background: `conic-gradient(from -90deg, #f43f5e 0% ${overduePercent}% , #f59e0b ${overduePercent}% 100%)` }
    : { background: "conic-gradient(#64748b 0 100%)" };

  const metrics = summary ? [
    { label: "आज की वसूली", amount: summary.today_collection, detail: `${summary.today_receipts} रसीदें`, color: "text-emerald-200", border: "border-emerald-300/20" },
    { label: "इस महीने की वसूली", amount: summary.month_collection, detail: `${summary.month_receipts} रसीदें`, color: "text-cyan-200", border: "border-cyan-300/20" },
    { label: "कुल बकाया", amount: summary.overdue_amount, detail: `${summary.overdue_students} छात्र`, color: "text-rose-200", border: "border-rose-300/20" },
    { label: "अगले 7 दिनों में देय", amount: summary.upcoming_amount, detail: `${summary.upcoming_students} छात्र`, color: "text-amber-200", border: "border-amber-300/20" },
  ] : [];

  return (
    <section className="mx-auto mb-8 max-w-6xl rounded-2xl border border-white/20 bg-slate-950/55 p-4 shadow-xl backdrop-blur-lg sm:p-6" aria-labelledby="fee-overview-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="fee-overview-title" className="text-xl font-semibold text-white">फीस का आज का सारांश</h2>
          <p className="mt-1 text-sm text-gray-300">वसूली और देय फीस का सार</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadSummary(true)} disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-white/25 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" /> ताज़ा करें
          </button>
          <Link to="/fees" className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600">फीस लें</Link>
        </div>
      </div>
      {error && <div role="alert" className="mb-4 rounded-lg border border-rose-300/30 bg-rose-950/40 p-3 text-sm text-rose-100">{error}</div>}
      {loading && !summary ? <p className="py-8 text-center text-sm text-gray-300">फीस का सारांश लोड हो रहा है…</p> : summary && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(250px,1fr)]">
          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map(metric => <div key={metric.label} className={`rounded-xl border ${metric.border} bg-white/5 p-4`}>
              <p className="text-sm text-gray-300">{metric.label}</p>
              <p className={`mt-2 text-2xl font-bold tabular-nums ${metric.color}`}>{currency(metric.amount)}</p>
              <p className="mt-1 text-xs text-gray-400">{metric.detail}</p>
            </div>)}
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">देय फीस का विभाजन</h3>
            <div className="relative h-40 w-40 rounded-full" style={pieStyle} role="img"
              aria-label={`कुल देय ${currency(totalDue)}: बकाया ${currency(overdue)}, अगले 7 दिन में ${currency(upcoming)}`}>
              <div className="absolute inset-[28%] flex flex-col items-center justify-center rounded-full bg-slate-950 text-center">
                <span className="text-[10px] text-gray-300">कुल देय</span>
                <span className="text-sm font-bold text-white">{currency(totalDue)}</span>
              </div>
            </div>
            <div className="mt-4 grid w-full gap-2 text-xs sm:grid-cols-2 xl:grid-cols-1">
              <p className="flex items-center gap-2 text-rose-100"><span className="h-3 w-3 rounded-sm bg-rose-500" />बकाया {currency(overdue)}</p>
              <p className="flex items-center gap-2 text-amber-100"><span className="h-3 w-3 rounded-sm bg-amber-500" />अगले 7 दिन {currency(upcoming)}</p>
            </div>
            {totalDue === 0 && <p className="mt-2 text-xs text-gray-400">अभी कोई फीस देय नहीं है।</p>}
          </div>
        </div>
      )}
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
        {isAdmin() && <FeeDashboardOverview />}
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
