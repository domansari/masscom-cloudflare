import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";
import { FeeReminderButton } from "@/components/FeeReminderButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
  items: Array<{ fee_category: string; period: string; due_date: string; remaining_amount: number }>;
};

type FeeSummary = {
  today: string;
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

export default function DueListAndReminder() {
  const [summary, setSummary] = useState<FeeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadSummary = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/fees/summary", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "बकाया फीस सूची लोड नहीं हो पाई।");
      setSummary(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "बकाया फीस सूची लोड नहीं हो पाई।");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const query = search.trim().toLowerCase();
  const overdueItems = useMemo(() => (summary?.overdue_items || []).filter(item =>
    !query || [item.student_name, item.father_name, item.roll_no, item.course_name, item.period, item.phone]
      .some(value => String(value || "").toLowerCase().includes(query))
  ), [summary, query]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Due List & WhatsApp Reminder</h2>
          <p className="mt-1 text-sm text-gray-300">छात्र की बकाया किस्त और महीने के अनुसार WhatsApp API reminder भेजें।</p>
        </div>
        <button type="button" onClick={() => void loadSummary(true)} disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-md border border-white/25 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          ताज़ा करें
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-300/30 bg-rose-950/40 p-3 text-sm text-rose-100">{error}</p>}
      {summary && <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-rose-200/20 bg-rose-950/30 p-4">
          <p className="text-sm text-gray-300">कुल बकाया</p>
          <p className="mt-1 text-xl font-bold text-rose-100">{currency(summary.overdue_amount)}</p>
          <p className="mt-1 text-xs text-gray-400">{summary.overdue_students} छात्र</p>
        </div>
        <div className="rounded-xl border border-amber-200/20 bg-amber-950/20 p-4">
          <p className="text-sm text-gray-300">अगले 7 दिनों में देय</p>
          <p className="mt-1 text-xl font-bold text-amber-100">{currency(summary.upcoming_amount)}</p>
          <p className="mt-1 text-xs text-gray-400">{summary.upcoming_students} छात्र</p>
        </div>
        <div className="rounded-xl border border-white/15 bg-white/5 p-4">
          <label htmlFor="due-list-search" className="mb-2 block text-sm text-gray-300">छात्र / रोल नंबर / महीना खोजें</label>
          <Input id="due-list-search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="नाम, रोल नंबर या फीस महीना" className="border-white/25 bg-white/10 text-white placeholder:text-gray-400" />
        </div>
      </div>}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="border-white/20 bg-white/10 text-white backdrop-blur-lg">
          <CardHeader>
            <CardTitle>बकाया फीस और WhatsApp Reminder</CardTitle>
            <CardDescription className="text-gray-200">{overdueItems.length} छात्र सूची में</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !summary ? <p className="py-6 text-center text-gray-300">बकाया फीस लोड हो रही है…</p>
              : !overdueItems.length ? <p className="py-6 text-center text-gray-300">{search ? "इस खोज से कोई बकाया छात्र नहीं मिला।" : "अभी कोई बकाया फीस नहीं है।"}</p>
              : <ul className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                {overdueItems.map((item, index) => <li key={item.student_id + "-" + index} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.student_name}</p>
                    <p className="text-xs text-gray-300">{item.roll_no && "Roll " + item.roll_no + " · "}{item.period}</p>
                    <p className="text-sm text-rose-100">{currency(item.remaining_amount)} · Due {item.due_date}</p>
                  </div>
                  <FeeReminderButton
                    studentId={item.student_id}
                    studentName={item.student_name}
                    phone={item.phone}
                    periodLabel={item.period}
                    amount={item.remaining_amount}
                    installmentCount={item.items?.length || 1}
                    compact
                  />
                </li>)}
              </ul>}
          </CardContent>
        </Card>
        <Card className="border-white/20 bg-white/10 text-white backdrop-blur-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-amber-200" />आने वाली फीस</CardTitle>
            <CardDescription className="text-gray-200">अगले 7 दिनों में देय किस्तें</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !summary ? <p className="py-6 text-center text-gray-300">सूची लोड हो रही है…</p>
              : !summary?.upcoming_items.length ? <p className="py-6 text-center text-gray-300">अगले 7 दिनों में फीस देय नहीं है।</p>
              : <ul className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                {summary.upcoming_items.map((item, index) => <li key={item.student_id + "-" + index} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="min-w-0"><p className="truncate font-medium">{item.student_name}</p><p className="text-xs text-gray-300">{item.roll_no && "Roll " + item.roll_no + " · "}{item.period} · Due {item.due_date}</p></div>
                  <span className="shrink-0 text-sm font-semibold text-amber-100">{currency(item.remaining_amount)}</span>
                </li>)}
              </ul>}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
