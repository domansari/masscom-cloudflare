import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, IndianRupee, Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
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
  payment_method: string; period: string | null; notes: string | null;
};
type FeeReceipt = { receipt_no: string; student_name: string; enrollment_no: string; fee_category: string; amount: number; payment_date: string; payment_method: string; period: string; notes: string };
type FormState = {
  student_id: string; fee_category: string; amount: string; payment_date: string;
  payment_method: string; period: string; notes: string;
};
const categories = ["Monthly Fee", "Admission Fee", "Reexam Fee", "Certificate Issue Fee", "Other"];
const methods = ["Cash", "UPI"];
const today = new Date();
const todayInput = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
const freshForm = (): FormState => ({
  student_id: "", fee_category: "Monthly Fee", amount: "", payment_date: todayInput,
  payment_method: "Cash", period: "", notes: "",
});
const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to complete the fee request.");
  return result;
}

export default function ManageFees() {
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [form, setForm] = useState<FormState>(freshForm);
  const [editingId, setEditingId] = useState("");
  const [activeTab, setActiveTab] = useState("collect");
  const [search, setSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [receiptForPrint, setReceiptForPrint] = useState<FeeReceipt | null>(null);

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
    if (!query) return payments;
    return payments.filter(payment =>
      [payment.receipt_no, payment.student_name, payment.enrollment_no, payment.fee_category, payment.payment_method]
        .some(value => String(value || "").toLowerCase().includes(query))
    );
  }, [payments, search]);

  const updateField = (key: keyof FormState, value: string) => setForm(current => ({ ...current, [key]: value }));

  const resetForm = () => {
    setForm(freshForm());
    setEditingId("");
    setStudentSearch("");
  };

  const editPayment = (payment: FeePayment) => {
    setEditingId(payment.id);
    setForm({
      student_id: payment.student_id || "", fee_category: payment.fee_category,
      amount: String(payment.amount), payment_date: payment.payment_date,
      payment_method: payment.payment_method, period: payment.period || "", notes: payment.notes || "",
    });
    setActiveTab("collect");
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
        body: JSON.stringify(form),
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
                    <select id="fee-method" required value={form.payment_method} onChange={event => updateField("payment_method", event.target.value)} className="h-10 w-full rounded-md border border-white/30 bg-white/10 px-3 text-sm text-white">
                      {methods.map(item => <option key={item} className="text-slate-900">{item}</option>)}
                    </select>
                  </div>
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
                <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" /><Input aria-label="Search fee records" placeholder="Search student, enrollment, receipt..." value={search} onChange={event => setSearch(event.target.value)} className="pl-9 border-white/30 bg-white/10 text-white placeholder:text-gray-300" /></div>
              </CardHeader>
              <CardContent>
                {loadError && <p role="alert" className="mb-4 rounded-md border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-100">{loadError}</p>}
                {loading ? <p className="py-8 text-center text-gray-200">Loading fee records…</p> : filteredPayments.length === 0 ? <p className="py-8 text-center text-gray-200">{payments.length ? "No matching fee records." : "No fee collections have been recorded yet."}</p> : (
                  <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
                    <thead><tr className="border-b border-white/20 text-gray-200"><th className="px-3 py-3">Receipt</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Student</th><th className="px-3 py-3">Enrollment No.</th><th className="px-3 py-3">Type / Period</th><th className="px-3 py-3">Method</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Action</th></tr></thead>
                    <tbody>{filteredPayments.map(payment => <tr key={payment.id} className="border-b border-white/10 text-white">
                      <td className="px-3 py-3 font-medium">{payment.receipt_no}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatIndianDate(payment.payment_date)}</td>
                      <td className="px-3 py-3">{payment.student_name}</td>
                      <td className="px-3 py-3">{payment.enrollment_no || "—"}</td>
                      <td className="px-3 py-3">{payment.fee_category}{payment.period ? <div className="text-xs text-gray-300">{payment.period}</div> : null}</td>
                      <td className="px-3 py-3">{payment.payment_method}</td>
                      <td className="px-3 py-3 text-right font-semibold">{currency(payment.amount)}</td>
                      <td className="px-3 py-3"><Button type="button" variant="outline" size="sm" onClick={() => editPayment(payment)}><Pencil className="mr-2 h-4 w-4" />Edit</Button></td>
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
