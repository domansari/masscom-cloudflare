import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Edit, Eye, IndianRupee, Printer, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link, useSearchParams } from "react-router-dom";
import { buildEnrollmentNo } from "../../functions/api/_student-enrollment.js";
import { formatIndianDate } from "@/lib/date-format";

type Student = {
  id: string; student_name: string; roll_no: string | null; batch_code: string | null;
  section_batch: string | null; session_year: string | null; course_name: string | null;
  one_time_fee: number | null; monthly_fee: number | null; is_active: number;
};
type FeePayment = {
  id: string; receipt_no: string; student_id: string | null; student_name: string;
  enrollment_no: string | null; fee_category: string; amount: number; payment_date: string;
  payment_method: string; upi_reference_number: string | null; fee_plan_item_id: string | null; period: string | null; notes: string | null;
};
type FeeReceipt = { receipt_no: string; student_name: string; enrollment_no: string; fee_category: string; amount: number; payment_date: string; payment_method: string; upi_reference_number: string; period: string; notes: string };
type FormState = {
  student_id: string; fee_category: string; amount: string; payment_date: string;
  payment_method: string; upi_reference_number: string; period: string; notes: string;
};
const categories = ["Monthly Fee", "Admission Fee", "Reexam Fee", "Certificate Issue Fee", "Other"];
const methods = ["Cash", "UPI"];
const today = new Date();
const todayInput = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
const freshForm = (): FormState => ({
  student_id: "", fee_category: "Monthly Fee", amount: "", payment_date: todayInput,
  payment_method: "Cash", upi_reference_number: "", period: "", notes: "",
});
const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to complete the fee request.");
  return result;
}

export default function ManageFees() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [form, setForm] = useState<FormState>(freshForm);
  const [editingId, setEditingId] = useState("");
  const [activeTab, setActiveTab] = useState("collect");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [receiptForPrint, setReceiptForPrint] = useState<FeeReceipt | null>(null);
  const [receiptForView, setReceiptForView] = useState<FeeReceipt | null>(null);
  const [planItemId, setPlanItemId] = useState("");
  const [planItemIds, setPlanItemIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState("");

  const loadData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [studentsResponse, feesResponse] = await Promise.all([
        fetch("/api/students", { cache: "no-store" }),
        fetch("/api/fees", { cache: "no-store" }),
      ]);
      const [studentsData, feesData] = await Promise.all([readJson(studentsResponse), readJson(feesResponse)]);
      setStudents(studentsData.data || []);
      setPayments(feesData.data || []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load fee records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    const receiptId = searchParams.get("receipt");
    if (!receiptId || loading) return;
    const receipt = payments.find(payment => payment.id === receiptId);
    if (receipt) {
      setReceiptForPrint({ receipt_no: receipt.receipt_no, student_name: receipt.student_name, enrollment_no: receipt.enrollment_no || "", fee_category: receipt.fee_category, amount: Number(receipt.amount), payment_date: receipt.payment_date, payment_method: receipt.payment_method, upi_reference_number: receipt.upi_reference_number || "", period: receipt.period || "", notes: receipt.notes || "" });
      const params = new URLSearchParams(searchParams); params.delete("receipt"); setSearchParams(params, { replace: true });
    }
  }, [searchParams, setSearchParams, payments, loading]);

  useEffect(() => {
    const studentId = searchParams.get("student_id");
    const selectedIds = (searchParams.get("plan_item_ids") || "").split(",").map(value => value.trim()).filter(Boolean);
    const singleItemId = searchParams.get("plan_item_id") || "";
    if ((!selectedIds.length && !singleItemId) || !studentId || loading || !students.length) return;
    let active = true;
    fetch("/api/student-fee-plan?student_id=" + encodeURIComponent(studentId), { cache: "no-store" }).then(async response => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to load fee plan."); return result.data;
    }).then(plan => {
      if (!active) return;
      if (selectedIds.length) {
        const chosen = selectedIds.map(id => (plan?.items || []).find((entry: { id: string }) => entry.id === id));
        if (chosen.some(item => !item || item.is_waived || item.remaining_amount <= 0)) throw new Error("One or more selected installments are already paid or waived.");
        const items = chosen as Array<{ id: string; fee_category: string; remaining_amount: number; period: string; description: string }>;
        const categories = [...new Set(items.map(item => item.fee_category))];
        const period = items.length === 1 ? items[0].period || "" : "Multiple installments";
        const details = "Plan installments: " + items.map(item => [item.period || item.description, currency(item.remaining_amount)].join(" ")).join("; ");
        setForm({ student_id: studentId, fee_category: categories.length === 1 ? categories[0] : "Other", amount: String(items.reduce((sum, item) => sum + item.remaining_amount, 0)), payment_date: todayInput, payment_method: "Cash", upi_reference_number: "", period, notes: details.slice(0, 490) });
        setPlanItemId(""); setPlanItemIds(items.map(item => item.id));
      } else {
        const item = (plan?.items || []).find((entry: { id: string }) => entry.id === singleItemId);
        if (!item || item.is_waived || item.remaining_amount <= 0) throw new Error("This fee plan item is already paid or waived.");
        setForm({ student_id: studentId, fee_category: item.fee_category, amount: String(item.remaining_amount), payment_date: todayInput, payment_method: "Cash", upi_reference_number: "", period: item.period || "", notes: "" });
        setPlanItemId(item.id); setPlanItemIds([]);
      }
      setEditingId(""); setActiveTab("collect");
      setSearchParams(new URLSearchParams(), { replace: true });
    }).catch(error => { if (active) toast({ title: "Could not open fee collection", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); });
    return () => { active = false; };
  }, [searchParams, setSearchParams, loading, students, toast]);

  useEffect(() => {
    if (!receiptForPrint) return;
    const finishPrint = () => setReceiptForPrint(null);
    window.addEventListener("afterprint", finishPrint, { once: true });
    const timer = window.setTimeout(() => window.print(), 250);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", finishPrint);
    };
  }, [receiptForPrint]);

  const activeStudents = students.filter(student => student.is_active === 1);
  const selectedStudent = activeStudents.find(student => student.id === form.student_id);
  const matchingStudents = activeStudents.filter(student => !studentSearch.trim() || String(student.roll_no || "").toLowerCase().includes(studentSearch.trim().toLowerCase()));
  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payments.filter(payment => {
      const inDateRange = (!fromDate || payment.payment_date >= fromDate) && (!toDate || payment.payment_date <= toDate);
      const matchesSearch = !query || [payment.receipt_no, payment.student_name, payment.enrollment_no, payment.fee_category, payment.payment_method, payment.upi_reference_number]
        .some(value => String(value || "").toLowerCase().includes(query));
      return inDateRange && matchesSearch;
    });
  }, [payments, search, fromDate, toDate]);

  const updateField = (key: keyof FormState, value: string) => setForm(current => ({ ...current, [key]: value }));

  const resetForm = () => {
    setForm(freshForm());
    setEditingId("");
    setPlanItemId("");
    setPlanItemIds([]);
    setStudentSearch("");
  };

  const editPayment = (payment: FeePayment) => {
    setEditingId(payment.id);
    setPlanItemId(payment.fee_plan_item_id || "");
    setPlanItemIds([]);
    setForm({
      student_id: payment.student_id || "", fee_category: payment.fee_category,
      amount: String(payment.amount), payment_date: payment.payment_date,
      payment_method: payment.payment_method, upi_reference_number: payment.upi_reference_number || "", period: payment.period || "", notes: payment.notes || "",
    });
    setActiveTab("collect");
  };

  const receiptFromPayment = (payment: FeePayment): FeeReceipt => ({ receipt_no: payment.receipt_no, student_name: payment.student_name, enrollment_no: payment.enrollment_no || "", fee_category: payment.fee_category, amount: payment.amount, payment_date: payment.payment_date, payment_method: payment.payment_method, upi_reference_number: payment.upi_reference_number || "", period: payment.period || "", notes: payment.notes || "" });

  const deletePayment = async (payment: FeePayment) => {
    if (!window.confirm(`Delete receipt ${payment.receipt_no} for ${payment.student_name}?`)) return;
    const password = window.prompt("Enter your admin password to delete this fee receipt.");
    if (password === null) return;
    setDeletingId(payment.id);
    try {
      const response = await fetch("/api/fees?id=" + encodeURIComponent(payment.id), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      await readJson(response);
      setPayments(current => current.filter(item => item.id !== payment.id));
      toast({ title: "Receipt deleted", description: payment.receipt_no });
    } catch (error) {
      toast({ title: "Could not delete receipt", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setDeletingId(""); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const printAfterSave = !editingId && submitter?.value === "collect-print";
    const wasEditing = Boolean(editingId);
    setBusy(true);
    try {
      const url = "/api/fees" + (editingId ? "?id=" + encodeURIComponent(editingId) : "");
      const response = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, fee_plan_item_id: planItemId || null, fee_plan_item_ids: planItemIds.length ? planItemIds : undefined }),
      });
      const result = await readJson(response);
      await loadData();
      if (!wasEditing) {
        toast({ title: "Fee collected", description: "Receipt " + result.receipt_no + " · " + currency(Number(form.amount)) });
        if (printAfterSave) {
          setReceiptForPrint({
            receipt_no: result.receipt_no,
            student_name: selectedStudent?.student_name || "",
            enrollment_no: selectedStudent ? buildEnrollmentNo(selectedStudent) || "" : "",
            fee_category: form.fee_category,
            amount: Number(form.amount),
            payment_date: form.payment_date,
            payment_method: form.payment_method,
            upi_reference_number: form.upi_reference_number,
            period: form.period,
            notes: form.notes,
          });
        }
      } else toast({ title: "Fee record updated" });
      resetForm();
      setActiveTab(printAfterSave ? "collect" : "manage");
    } catch (error) {
      toast({ title: wasEditing ? "Could not update fee" : "Could not collect fee", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <style>{".fee-receipt-print{display:none}@page{size:A4;margin:10mm}@media print{body{background:#fff!important}body *{visibility:hidden!important}.fee-receipt-print,.fee-receipt-print *{visibility:visible!important}.fee-receipt-print{display:flex!important;position:fixed;inset:0;width:190mm;height:277mm;flex-direction:column;background:#fff;color:#111;font-family:Arial,sans-serif}.fee-receipt-copy{box-sizing:border-box;height:138.5mm;flex:1 1 50%;padding:7mm 8mm;border-bottom:1px dashed #777;page-break-inside:avoid}.fee-receipt-copy:last-child{border-bottom:0}}"}</style>
      {receiptForPrint && <div className="fee-receipt-print">
        {(["STUDENT COPY", "OFFICE COPY"] as const).map(copy => (
          <section className="fee-receipt-copy" key={copy}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #222", paddingBottom: "4mm", marginBottom: "4mm" }}>
              <div><h1 style={{ margin: 0, fontSize: "17pt", fontWeight: 700 }}>Masscom Infotech Education</h1><p style={{ margin: "2mm 0 0", fontSize: "9pt" }}>FEE RECEIPT</p></div>
              <div style={{ textAlign: "right", fontSize: "9pt" }}><strong>{copy}</strong><br />Receipt No: {receiptForPrint.receipt_no}</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
              <tbody>
                <tr><td style={{ border: "1px solid #777", padding: "3mm", width: "25%" }}>Student Name</td><td style={{ border: "1px solid #777", padding: "3mm", width: "40%" }}>{receiptForPrint.student_name}</td><td style={{ border: "1px solid #777", padding: "3mm", width: "16%" }}>Date</td><td style={{ border: "1px solid #777", padding: "3mm" }}>{formatIndianDate(receiptForPrint.payment_date)}</td></tr>
                <tr><td style={{ border: "1px solid #777", padding: "3mm" }}>Enrollment No.</td><td style={{ border: "1px solid #777", padding: "3mm" }}>{receiptForPrint.enrollment_no || "—"}</td><td style={{ border: "1px solid #777", padding: "3mm" }}>Payment</td><td style={{ border: "1px solid #777", padding: "3mm" }}>{receiptForPrint.payment_method}</td></tr>
                <tr><td style={{ border: "1px solid #777", padding: "3mm" }}>Fee Head</td><td style={{ border: "1px solid #777", padding: "3mm" }}>{receiptForPrint.fee_category}</td><td style={{ border: "1px solid #777", padding: "3mm" }}>Period</td><td style={{ border: "1px solid #777", padding: "3mm" }}>{receiptForPrint.period || "—"}</td></tr>
                {receiptForPrint.payment_method === "UPI" && <tr><td style={{ border: "1px solid #777", padding: "3mm" }}>UPI Reference No.</td><td colSpan={3} style={{ border: "1px solid #777", padding: "3mm" }}>{receiptForPrint.upi_reference_number || "—"}</td></tr>}
                <tr><td style={{ border: "1px solid #777", padding: "3mm" }}>Notes</td><td colSpan={3} style={{ border: "1px solid #777", padding: "3mm" }}>{receiptForPrint.notes || "—"}</td></tr>
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #333", marginTop: "4mm", padding: "3mm 4mm", fontSize: "12pt" }}>
              <strong>Amount Received</strong><strong>{currency(receiptForPrint.amount)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "16mm", fontSize: "9pt" }}>
              <span>Student / Guardian Signature</span><span>Authorized Signature</span>
            </div>
          </section>
        ))}
      </div>}
      {receiptForView && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setReceiptForView(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="receipt-view-title" className="w-full max-w-xl rounded-xl border border-white/20 bg-slate-900 p-6 text-white shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="receipt-view-title" className="text-xl font-bold">Fee Receipt</h2><p className="text-sm text-gray-300">{receiptForView.receipt_no}</p></div><Button type="button" variant="outline" size="icon" aria-label="Close receipt" onClick={() => setReceiptForView(null)}><X className="h-4 w-4" /></Button></div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><dt className="text-gray-300">Student</dt><dd>{receiptForView.student_name}</dd><dt className="text-gray-300">Enrollment No.</dt><dd>{receiptForView.enrollment_no || "—"}</dd><dt className="text-gray-300">Date</dt><dd>{formatIndianDate(receiptForView.payment_date)}</dd><dt className="text-gray-300">Fee Type</dt><dd>{receiptForView.fee_category}</dd><dt className="text-gray-300">Payment Method</dt><dd>{receiptForView.payment_method}</dd>{receiptForView.payment_method === "UPI" && <><dt className="text-gray-300">UPI Reference No.</dt><dd>{receiptForView.upi_reference_number || "—"}</dd></>}<dt className="text-gray-300">Period</dt><dd>{receiptForView.period || "—"}</dd><dt className="text-gray-300">Amount</dt><dd className="font-semibold">{currency(receiptForView.amount)}</dd><dt className="text-gray-300">Notes</dt><dd>{receiptForView.notes || "—"}</dd></dl>
          <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setReceiptForView(null)}>Close</Button><Button type="button" onClick={() => { setReceiptForPrint(receiptForView); setReceiptForView(null); }}><Printer className="mr-2 h-4 w-4" />Print Receipt</Button></div>
        </section>
      </div>}
      <div className="absolute inset-0 bg-black/40" />
      <main className="container relative z-10 mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <header className="mb-6">
          <Button asChild variant="outline" className="mb-5 border-white/30 bg-white/10 text-white hover:bg-white/20">
            <Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard</Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg">
              <IndianRupee className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Manage Fees</h1>
              <p className="mt-1 text-sm text-gray-200">Collect and manage student fee payments.</p>
            </div>
          </div>
        </header>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="h-auto rounded-lg border border-white/20 bg-black/20 p-1 shadow-sm backdrop-blur-lg">
            <TabsTrigger value="collect" className="data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=inactive]:text-white">Collect</TabsTrigger>
            <TabsTrigger value="manage" className="data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=inactive]:text-white">Manage</TabsTrigger>
          </TabsList>
          <TabsContent value="collect" className="mt-0">
            <Card className="border-white/20 bg-white/10 text-white backdrop-blur-lg">
              <CardHeader>
                <CardTitle>Collect Fee</CardTitle>
                <CardDescription className="text-gray-200">{editingId ? "Update the selected fee entry." : "Record a fee payment received from a student."}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="student-roll-search">Search by Roll Number</Label>
                    <Input id="student-roll-search" type="search" disabled={Boolean(editingId)} placeholder="Enter student roll number" value={studentSearch} onChange={event => { setStudentSearch(event.target.value); updateField("student_id", ""); }} className="border-white/30 bg-white/10 text-white placeholder:text-gray-300" />
                    <Label htmlFor="fee-student">Student *</Label>
                    <select id="fee-student" required disabled={Boolean(editingId)} value={form.student_id} onChange={event => updateField("student_id", event.target.value)} className="h-10 w-full rounded-md border border-white/30 bg-white/10 px-3 text-sm text-white">
                      <option value="" className="text-slate-900">Select a student</option>
                      {matchingStudents.map(student => <option key={student.id} value={student.id} className="text-slate-900">{student.roll_no || "No roll number"} · {student.student_name}</option>)}
                    </select>
                    {studentSearch && matchingStudents.length === 0 && <p className="text-xs text-amber-200">No active student found with that roll number.</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fee-category">Fee Type *</Label>
                    <select id="fee-category" required value={form.fee_category} onChange={event => updateField("fee_category", event.target.value)} className="h-10 w-full rounded-md border border-white/30 bg-white/10 px-3 text-sm text-white">
                      {categories.map(item => <option key={item} className="text-slate-900">{item}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fee-amount">Amount (₹) *</Label>
                    <Input id="fee-amount" type="number" min="0.01" step="0.01" required value={form.amount} onChange={event => updateField("amount", event.target.value)} className="border-white/30 bg-white/10 text-white placeholder:text-gray-300" />
                    {selectedStudent && <p className="text-xs text-gray-300">Recorded one-time fee: {selectedStudent.one_time_fee == null ? "—" : currency(selectedStudent.one_time_fee)} · Monthly fee: {selectedStudent.monthly_fee == null ? "—" : currency(selectedStudent.monthly_fee)}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fee-date">Payment Date *</Label>
                    <Input id="fee-date" type="date" lang="en-IN" required value={form.payment_date} onChange={event => updateField("payment_date", event.target.value)} className="border-white/30 bg-white/10 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fee-method">Payment Method *</Label>
                    <select id="fee-method" required value={form.payment_method} onChange={event => { updateField("payment_method", event.target.value); if (event.target.value !== "UPI") updateField("upi_reference_number", ""); }} className="h-10 w-full rounded-md border border-white/30 bg-white/10 px-3 text-sm text-white">
                      {methods.map(item => <option key={item} className="text-slate-900">{item}</option>)}
                    </select>
                  </div>
                  {form.payment_method === "UPI" && <div className="space-y-2">
                    <Label htmlFor="fee-upi-reference">UPI Reference Number *</Label>
                    <Input id="fee-upi-reference" required maxLength={120} value={form.upi_reference_number} onChange={event => updateField("upi_reference_number", event.target.value)} placeholder="Enter UPI transaction/reference number" className="border-white/30 bg-white/10 text-white placeholder:text-gray-300" />
                  </div>}
                  <div className="space-y-2">
                    <Label htmlFor="fee-period">Month / Period</Label>
                    <Input id="fee-period" maxLength={40} placeholder="For example, November 2026" value={form.period} onChange={event => updateField("period", event.target.value)} className="border-white/30 bg-white/10 text-white placeholder:text-gray-300" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="fee-notes">Notes</Label>
                    <Input id="fee-notes" maxLength={500} value={form.notes} onChange={event => updateField("notes", event.target.value)} className="border-white/30 bg-white/10 text-white" />
                  </div>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    {editingId ? (
                      <>
                        <Button type="submit" name="submit_action" value="collect" disabled={busy || loading} className="bg-gradient-to-r from-emerald-500 to-emerald-700 text-white hover:from-emerald-600 hover:to-emerald-800">{busy ? "Saving…" : "Update Fee"}</Button>
                        <Button type="button" variant="outline" onClick={resetForm}><X className="mr-2 h-4 w-4" />Cancel Edit</Button>
                      </>
                    ) : (
                      <>
                        <Button type="submit" name="submit_action" value="collect" disabled={busy || loading || !activeStudents.length} className="bg-gradient-to-r from-emerald-500 to-emerald-700 text-white hover:from-emerald-600 hover:to-emerald-800">{busy ? "Saving…" : "Collect"}</Button>
                        <Button type="submit" name="submit_action" value="collect-print" disabled={busy || loading || !activeStudents.length} variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">{busy ? "Saving…" : "Collect & Print Receipt"}</Button>
                      </>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="manage" className="mt-0">
            <Card className="border-white/20 bg-white/10 text-white backdrop-blur-lg">
              <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div><CardTitle>Fee Records</CardTitle><CardDescription className="mt-1 text-gray-200">{payments.length} collections recorded</CardDescription></div>
                <div className="flex w-full flex-col gap-3 sm:max-w-2xl"><div className="relative w-full"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" /><Input aria-label="Search fee records" placeholder="Search student, enrollment, receipt, UPI reference..." value={search} onChange={event => setSearch(event.target.value)} className="pl-9 border-white/30 bg-white/10 text-white placeholder:text-gray-300" /></div><div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label htmlFor="fees-from-date" className="text-xs text-gray-200">From date</Label><Input id="fees-from-date" type="date" value={fromDate} max={toDate || undefined} onChange={event => setFromDate(event.target.value)} className="border-white/30 bg-white/10 text-white" /></div><div className="space-y-1"><Label htmlFor="fees-to-date" className="text-xs text-gray-200">To date</Label><Input id="fees-to-date" type="date" value={toDate} min={fromDate || undefined} onChange={event => setToDate(event.target.value)} className="border-white/30 bg-white/10 text-white" /></div></div></div>
              </CardHeader>
              <CardContent>
                {loadError && <p role="alert" className="mb-4 rounded-md border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-100">{loadError}</p>}
                {loading ? <p className="py-8 text-center text-gray-200">Loading fee records…</p> : filteredPayments.length === 0 ? <p className="py-8 text-center text-gray-200">{payments.length ? "No matching fee records." : "No fee collections have been recorded yet."}</p> : (
                  <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
                    <thead><tr className="border-b border-white/20 text-gray-200"><th className="px-3 py-3">Receipt</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Student</th><th className="px-3 py-3">Enrollment No.</th><th className="px-3 py-3">Type / Period</th><th className="px-3 py-3">Method</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Actions</th></tr></thead>
                    <tbody>{filteredPayments.map(payment => <tr key={payment.id} className="border-b border-white/10 text-white">
                      <td className="px-3 py-3 font-medium">{payment.receipt_no}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatIndianDate(payment.payment_date)}</td>
                      <td className="px-3 py-3">{payment.student_name}</td>
                      <td className="px-3 py-3">{payment.enrollment_no || "—"}</td>
                      <td className="px-3 py-3">{payment.fee_category}{payment.period ? <div className="text-xs text-gray-300">{payment.period}</div> : null}</td>
                      <td className="px-3 py-3">{payment.payment_method}</td>
                      <td className="px-3 py-3 text-right font-semibold">{currency(payment.amount)}</td>
                      <td className="px-3 py-3"><div className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap"><Button type="button" size="sm" title="View receipt" aria-label="View receipt" onClick={() => setReceiptForView(receiptFromPayment(payment))} className="h-8 w-8 shrink-0 p-0 bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 text-white shadow-lg transition-all duration-300 hover:scale-105"><Eye className="h-4 w-4" /></Button><Button type="button" size="sm" title="Print receipt" aria-label="Print receipt" onClick={() => setReceiptForPrint(receiptFromPayment(payment))} className="h-8 w-8 shrink-0 p-0 bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white shadow-lg transition-all duration-300 hover:scale-105"><Printer className="h-4 w-4" /></Button><Button type="button" size="sm" title="Edit receipt" aria-label="Edit receipt" onClick={() => editPayment(payment)} className="h-8 w-8 shrink-0 p-0 bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-lg transition-all duration-300 hover:scale-105"><Edit className="h-4 w-4" /></Button><Button type="button" size="sm" title={deletingId === payment.id ? "Deleting receipt" : "Delete receipt"} aria-label={deletingId === payment.id ? "Deleting receipt" : "Delete receipt"} disabled={deletingId === payment.id} onClick={() => void deletePayment(payment)} className="h-8 w-8 shrink-0 p-0 bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white shadow-lg transition-all duration-300 hover:scale-105 disabled:opacity-60"><Trash2 className="h-4 w-4" /></Button></div></td>
                    </tr>)}</tbody>
                  </table></div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
