import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArrowLeft, CreditCard, Download, Eye, FileText, Image, Edit, Plus, RotateCcw, Search, Trash2, Users, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { certificateCourseOptions } from "../../functions/api/_exam-courses.js";
import { batchTimings, buildEnrollmentNo } from "../../functions/api/_student-enrollment.js";
import { courseDurationMonths } from "@/lib/course-duration";
import { formatIndianDate, formatSessionYear } from "@/lib/date-format";
import StudentPreview from "./StudentPreview";
import StudentIdCard, { type StudentIdCardRecord } from "@/components/StudentIdCard";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

type Student = {
  id: string; student_name: string; first_name: string | null; last_name: string | null;
  father_name: string | null; mother_name: string | null; gender: string | null; category: string | null;
  aadhaar_last4: string | null; roll_no: string | null; batch_code: string | null; section_batch: string | null;
  course_name: string | null; session_year: string | null; batch_timing: string | null;
  admission_date: string | null; date_of_birth: string | null; phone: string | null; email: string | null;
  address: string | null; notes: string | null; one_time_fee: number | null; monthly_fee: number | null;
  course_duration_months: number | null; waive_last_two_months: number; is_active: number;
};

type StudentForm = Omit<Student, "id" | "is_active">;
type DocumentType = "photo";
type StudentDocument = { document_type: DocumentType; file_name: string; content_type: string; file_size: number; created_at: string };
type FeeReceipt = { id: string; receipt_no: string; amount: number; payment_date: string; period: string; mr_number?: string };
type FeePlanItem = { id: string; fee_category: string; description: string; amount: number; paid_amount: number; remaining_amount: number; due_date: string; period: string; is_waived: boolean; status: "paid" | "pending" | "upcoming" | "waived"; receipts: FeeReceipt[] };
type OtherDeposit = { id: string; receipt_no: string; amount: number; payment_date: string; payment_method: string; mr_number: string | null; notes: string | null };
type FeePlan = { student_id: string; student_name: string; roll_no: string | null; course_name: string | null; duration_months: number; configured: boolean; total_amount: number; paid_amount: number; pending_amount: number; upcoming_amount: number; outstanding_amount: number; items: FeePlanItem[] };
const documentField = { type: "photo" as const, label: "Student Photo", accept: "image/jpeg,image/png,image/webp" };
const emptyDocumentFiles = (): Record<DocumentType, File | null> => ({ photo: null });
const today = new Date();
const dateInput = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const academicStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
const currentSession = String(academicStartYear);
const emptyForm: StudentForm = {
  student_name: "", first_name: "", last_name: "", father_name: "", mother_name: "", gender: "Male", category: "",
  aadhaar_last4: "", roll_no: "", batch_code: "", section_batch: "", course_name: "",
  session_year: currentSession, batch_timing: "", admission_date: dateInput, date_of_birth: "", phone: "", email: "", address: "", notes: "",
  one_time_fee: null, monthly_fee: null, course_duration_months: null, waive_last_two_months: 0,
};

async function request(method: string, id?: string, body?: object) {
  const response = await fetch(`/api/students${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to complete the request.");
  return data;
}

async function requestDocuments(studentId: string, method = "GET", type?: DocumentType, file?: File) {
  const params = new URLSearchParams({ student_id: studentId });
  if (type) params.set("type", type);
  const headers: HeadersInit = {};
  const body = file ? new FormData() : undefined;
  if (file) body?.append("file", file);
  const response = await fetch(`/api/students/files?${params}`, { method, headers, body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to complete the document request.");
  return data;
}

async function requestIdCards(method = "GET", id?: string, body?: object) {
  const url = "/api/student-id-cards" + (id ? "?id=" + encodeURIComponent(id) : "");
  const response = await fetch(url, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to complete the ID card request.");
  return data;
}

const display = (value: string | number | null) => value == null || value === "" ? "—" : String(value);
const feeMoney = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section id={id} className="space-y-4"><h3 className="border-b border-white/20 pb-2 text-lg font-semibold text-white">{title}</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div></section>;
}

export default function ManageStudents() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [documentFiles, setDocumentFiles] = useState<Record<DocumentType, File | null>>(emptyDocumentFiles);
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState<string | null>(null);
  const [form, setForm] = useState<StudentForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"new" | "manage" | "fee-plan" | "preview" | "id-card">("new");
  const [previewStudentId, setPreviewStudentId] = useState<string | null>(null);
  const [idCards, setIdCards] = useState<StudentIdCardRecord[]>([]);
  const [selectedIdCardId, setSelectedIdCardId] = useState<string | null>(null);
  const [idCardStudentToCreate, setIdCardStudentToCreate] = useState("");
  const [idCardLoading, setIdCardLoading] = useState(false);
  const [idCardBusy, setIdCardBusy] = useState(false);
  const [idCardEditing, setIdCardEditing] = useState(false);
  const [idCardRegistrationNo, setIdCardRegistrationNo] = useState("");
  const [idCardNotice, setIdCardNotice] = useState("");
  const [cardToDelete, setCardToDelete] = useState<StudentIdCardRecord | null>(null);
  const [cardDeletePassword, setCardDeletePassword] = useState("");
  const [cardDeleteError, setCardDeleteError] = useState("");
  const [cardDeleting, setCardDeleting] = useState(false);
  const idCardPreviewRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [feePlanSearch, setFeePlanSearch] = useState("");
  const [feePlanStudentId, setFeePlanStudentId] = useState("");
  const [selectedFeePlanItemIds, setSelectedFeePlanItemIds] = useState<string[]>([]);
  const [feePlan, setFeePlan] = useState<FeePlan | null>(null);
  const [otherDeposits, setOtherDeposits] = useState<OtherDeposit[]>([]);
  const [certificateFeeBusy, setCertificateFeeBusy] = useState(false);
  const [feePlanLoading, setFeePlanLoading] = useState(false);
  const [feePlanError, setFeePlanError] = useState("");
  const [reexamAmount, setReexamAmount] = useState("");
  const [reexamBusy, setReexamBusy] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadStudents = useCallback(async () => {
    try { const data = await request("GET"); setStudents(data.data || []); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load students."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadStudents(); }, [loadStudents]);
  useEffect(() => {
    const id = searchParams.get("edit");
    const student = id && students.find(item => item.id === id);
    if (!student) return;
    const focusFees = searchParams.get("focus") === "fees";
    edit(student);
    setSearchParams({}, { replace: true });
    if (focusFees) window.setTimeout(() => document.getElementById("student-fees")?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  }, [students, searchParams]);
  useEffect(() => {
    if (activeTab !== "fee-plan" || !feePlanStudentId) { setFeePlan(null); setOtherDeposits([]); return; }
    let active = true;
    setFeePlanLoading(true);
    setFeePlanError("");
    fetch("/api/student-fee-plan?student_id=" + encodeURIComponent(feePlanStudentId), { cache: "no-store" })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to load fee plan."); return result; })
      .then(result => { if (active) { setFeePlan(result.data || null); setOtherDeposits(result.other_deposits || []); } })
      .catch(cause => { if (active) setFeePlanError(cause instanceof Error ? cause.message : "Unable to load fee plan."); })
      .finally(() => { if (active) setFeePlanLoading(false); });
    return () => { active = false; };
  }, [activeTab, feePlanStudentId]);

  useEffect(() => {
    if (activeTab !== "id-card") return;
    let active = true;
    setIdCardLoading(true);
    requestIdCards().then(result => {
      if (!active) return;
      const records = result.data || [];
      setIdCards(records);
      setSelectedIdCardId(current => records.some(card => card.id === current) ? current : records[0]?.id || null);
    }).catch(cause => {
      if (active) setIdCardNotice(cause instanceof Error ? cause.message : "Unable to load ID cards.");
    }).finally(() => { if (active) setIdCardLoading(false); });
    return () => { active = false; };
  }, [activeTab]);

  useEffect(() => {
    const photo = documentFiles.photo;
    if (!photo) { setSelectedPhotoPreview(null); return; }
    const previewUrl = URL.createObjectURL(photo);
    setSelectedPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [documentFiles.photo]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter(student => (includeArchived || student.is_active) &&
      (!query || [student.student_name, student.father_name, student.roll_no, student.batch_code, student.course_name, student.phone, student.email, student.session_year]
        .some(value => value?.toLowerCase().includes(query))));
  }, [students, search, includeArchived]);

  const updateField = (field: keyof StudentForm, value: string) => setForm(current => ({ ...current, [field]: value }));
  const matchingFeeStudents = students.filter(student => !feePlanSearch.trim() || String(student.roll_no || "").toLowerCase().includes(feePlanSearch.trim().toLowerCase()));
  const admissionFeeOutstanding = Number(feePlan?.items.find(item => item.fee_category === "Admission Fee")?.remaining_amount || 0);
  const selectedPlanItems = feePlan?.items.filter(item => selectedFeePlanItemIds.includes(item.id) && !item.is_waived && item.remaining_amount > 0 && (item.status === "pending" || item.status === "upcoming")) || [];
  const outstandingPlanItems = feePlan?.items.filter(item => !item.is_waived && item.remaining_amount > 0 && (admissionFeeOutstanding > 0.001 ? item.fee_category === "Admission Fee" : true)) || [];
  const planCollectionHref = (items: FeePlanItem[]) => "/fees?student_id=" + encodeURIComponent(feePlan?.student_id || "") + "&plan_item_ids=" + encodeURIComponent(items.map(item => item.id).join(","));
  useEffect(() => { setSelectedFeePlanItemIds([]); }, [feePlanStudentId]);
  const estimatedPlanTotal = Number(form.one_time_fee || 0) + Number(form.monthly_fee || 0) * Math.max(0, Number(form.course_duration_months || 0) - (form.waive_last_two_months ? 2 : 0));
  const activateReexamFee = async () => {
    if (!feePlanStudentId || reexamBusy) return;
    const amount = Number(reexamAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setFeePlanError("Enter a valid re-exam fee amount."); return; }
    setReexamBusy(true); setFeePlanError("");
    try {
      const response = await fetch("/api/student-fee-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "activate_reexam_fee", student_id: feePlanStudentId, amount }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not activate re-exam fee.");
      setFeePlan(result.data); setReexamAmount("");
      toast({ title: "Re-exam fee activated", description: "It is now included in this fee plan." });
    } catch (cause) { setFeePlanError(cause instanceof Error ? cause.message : "Could not activate re-exam fee."); }
    finally { setReexamBusy(false); }
  };
  const activateCertificateFee = async () => {
    if (!feePlanStudentId || certificateFeeBusy) return;
    setCertificateFeeBusy(true); setFeePlanError("");
    try {
      const response = await fetch("/api/student-fee-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "activate_certificate_issue_fee", student_id: feePlanStudentId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not activate certificate issue fee.");
      setFeePlan(result.data);
      toast({ title: "Certificate issue fee activated", description: "₹250 is now due and can be collected." });
    } catch (cause) { setFeePlanError(cause instanceof Error ? cause.message : "Could not activate certificate issue fee."); }
    finally { setCertificateFeeBusy(false); }
  };
  const loadDocuments = async (studentId: string) => {
    const result = await requestDocuments(studentId);
    setDocuments(result.data || []);
  };
  const resetForm = () => { setForm(emptyForm); setEditingId(null); setDocuments([]); setDocumentFiles(emptyDocumentFiles()); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const createIdCard = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-create-id-card") === "true";
    setSaving(true);
    try {
      const studentName = [form.first_name, form.last_name].filter(Boolean).join(" ").trim();
      const result = await request(editingId ? "PUT" : "POST", editingId || undefined, { ...form, student_name: studentName, is_active: 1 });
      const studentId = editingId || result.id;
      const failedUploads: string[] = [];
      const photo = documentFiles.photo;
      if (photo) {
        try { await requestDocuments(studentId, "POST", "photo", photo); }
        catch (cause) { failedUploads.push(`Student Photo: ${cause instanceof Error ? cause.message : "upload failed"}`); }
      }
      await loadStudents();
      if (failedUploads.length) {
        setEditingId(studentId);
        try { await loadDocuments(studentId); } catch { /* preserve the saved student form so its uploads can be retried */ }
        toast({ title: "Student saved; some files were not uploaded", description: failedUploads.join(" · "), variant: "destructive" });
      } else {
        toast({ title: editingId ? "Student record updated" : "Student added" });
        resetForm();
        if (createIdCard) {
          try {
            const savedCard = await requestIdCards("POST", undefined, { student_id: studentId });
            setIdCards(current => [savedCard.data, ...current.filter(card => card.id !== savedCard.data.id)]);
            setSelectedIdCardId(savedCard.data.id);
            setIdCardRegistrationNo(savedCard.data.registration_no);
            setIdCardEditing(false);
            setIdCardNotice("");
            setActiveTab("id-card");
            toast({ title: "ID card ready", description: savedCard.data.registration_no });
          } catch (cause) {
            setActiveTab("id-card");
            toast({ title: "Student saved; ID card could not be created", description: cause instanceof Error ? cause.message : "Please try again.", variant: "destructive" });
          }
        } else setActiveTab("manage");
      }
    } catch (cause) {
      toast({ title: "Could not save student", description: cause instanceof Error ? cause.message : "Please try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const edit = (student: Student) => {
    setActiveTab("new");
    setEditingId(student.id);
    const oldName = student.student_name.split(/\s+/);
    setForm({ ...emptyForm, ...student, first_name: student.first_name || oldName.shift() || "", last_name: student.last_name || oldName.join(" "),
      one_time_fee: student.one_time_fee ?? null, monthly_fee: student.monthly_fee ?? null,
      course_duration_months: student.course_duration_months ?? courseDurationMonths(student.course_name) ?? null,
      waive_last_two_months: student.waive_last_two_months ?? 0,
      admission_date: student.admission_date || "", date_of_birth: student.date_of_birth || "" });
    setDocumentFiles(emptyDocumentFiles());
    void loadDocuments(student.id).catch(cause => toast({ title: "Could not load student documents", description: cause instanceof Error ? cause.message : "Please try again.", variant: "destructive" }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setActive = async (student: Student, active: boolean) => {
    try {
      await request("PUT", student.id, { ...student, first_name: student.first_name || student.student_name, is_active: active ? 1 : 0 });
      toast({ title: active ? "Student restored" : "Student archived" }); await loadStudents();
    } catch (cause) { toast({ title: "Could not update student", description: cause instanceof Error ? cause.message : "Please try again.", variant: "destructive" }); }
  };

  const confirmDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!studentToDelete || !deletePassword || deleting) return;
    setDeleting(true); setDeleteError("");
    try {
      const response = await fetch(`/api/students?id=${encodeURIComponent(studentToDelete.id)}`, { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: deletePassword }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to delete student.");
      toast({ title: "Student permanently deleted", description: studentToDelete.student_name });
      setStudentToDelete(null); setDeletePassword(""); await loadStudents();
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Unable to delete student."); }
    finally { setDeleting(false); }
  };

  const selectIdCard = (card: StudentIdCardRecord) => {
    setSelectedIdCardId(card.id);
    setIdCardRegistrationNo(card.registration_no);
    setIdCardEditing(false);
    setIdCardNotice("");
  };

  const createIdCardForStudent = async () => {
    if (!idCardStudentToCreate || idCardBusy) return;
    setIdCardBusy(true); setIdCardNotice("");
    try {
      const saved = await requestIdCards("POST", undefined, { student_id: idCardStudentToCreate });
      const records = await requestIdCards();
      setIdCards(records.data || []);
      setSelectedIdCardId(saved.data.id);
      setIdCardRegistrationNo(saved.data.registration_no);
      setIdCardStudentToCreate("");
      toast({ title: "ID card created", description: saved.data.registration_no });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to create ID card.";
      setIdCardNotice(message);
      toast({ title: "Could not create ID card", description: message, variant: "destructive" });
    } finally { setIdCardBusy(false); }
  };

  const saveIdCardEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedIdCard || idCardBusy) return;
    setIdCardBusy(true); setIdCardNotice("");
    try {
      const result = await requestIdCards("PUT", selectedIdCard.id, { registration_no: idCardRegistrationNo });
      setIdCards(current => current.map(card => card.id === result.data.id ? result.data : card));
      setIdCardEditing(false);
      toast({ title: "ID card updated", description: result.data.registration_no });
    } catch (cause) {
      setIdCardNotice(cause instanceof Error ? cause.message : "Unable to update ID card.");
    } finally { setIdCardBusy(false); }
  };

  const confirmIdCardDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cardToDelete || !cardDeletePassword || cardDeleting) return;
    setCardDeleting(true); setCardDeleteError("");
    try {
      await requestIdCards("DELETE", cardToDelete.id, { password: cardDeletePassword });
      setIdCards(current => current.filter(card => card.id !== cardToDelete.id));
      if (selectedIdCardId === cardToDelete.id) { setSelectedIdCardId(null); setIdCardEditing(false); setIdCardRegistrationNo(""); }
      setCardToDelete(null); setCardDeletePassword("");
      toast({ title: "ID card deleted" });
    } catch (cause) {
      setCardDeleteError(cause instanceof Error ? cause.message : "Unable to delete ID card.");
    } finally { setCardDeleting(false); }
  };

  const createIdCardPdf = async () => {
    if (!idCardPreviewRef.current) throw new Error("Select an ID card first.");
    const canvas = await html2canvas(idCardPreviewRef.current, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [54, 86] });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 54, 86);
    return pdf;
  };

  const printIdCard = async () => {
    if (!selectedIdCard || !selectedIdCard.student_active || idCardBusy) return;
    setIdCardBusy(true);
    try {
      const pdf = await createIdCardPdf();
      pdf.autoPrint();
      const url = URL.createObjectURL(pdf.output("blob"));
      const printWindow = window.open(url, "_blank");
      if (!printWindow) toast({ title: "Allow pop-ups to print the ID card." });
      window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    } catch (cause) { toast({ title: "Could not prepare ID card", description: cause instanceof Error ? cause.message : "Please try again.", variant: "destructive" }); }
    finally { setIdCardBusy(false); }
  };

  const downloadIdCard = async () => {
    if (!selectedIdCard || !selectedIdCard.student_active || idCardBusy) return;
    setIdCardBusy(true);
    try {
      const pdf = await createIdCardPdf();
      pdf.save("Masscom-ID-" + selectedIdCard.registration_no.replace(/[^a-z0-9_-]/gi, "-") + ".pdf");
    } catch (cause) { toast({ title: "Could not download ID card", description: cause instanceof Error ? cause.message : "Please try again.", variant: "destructive" }); }
    finally { setIdCardBusy(false); }
  };

  const selectedIdCard = idCards.find(card => card.id === selectedIdCardId) || null;
  const studentsWithoutCards = students.filter(student => student.is_active && !idCards.some(card => card.student_id === student.id));
  const printAllowed = Boolean(selectedIdCard?.student_active && !idCardBusy);

  const field = (name: keyof StudentForm, label: string, required = false, type = "text", hint?: string) => <div className="space-y-2" key={name}>
    <Label htmlFor={name} className="text-white">{label}{required ? " *" : ""}</Label>
    <Input id={name} type={type} lang={type === "date" ? "en-IN" : undefined} inputMode={name === "session_year" ? "numeric" : undefined} maxLength={name === "session_year" ? 4 : undefined} value={form[name] == null ? "" : String(form[name])} onChange={event => updateField(name, name === "session_year" ? event.target.value.replace(/\D/g, "").slice(0, 4) : event.target.value)} required={required} className="border-white/30 bg-white/20 text-white placeholder:text-gray-300" />
    {hint && <p className="text-xs text-gray-200">{hint}</p>}
  </div>;
  const savedPhoto = editingId && documents.some(document => document.document_type === "photo")
    ? `/api/students/files?student_id=${encodeURIComponent(editingId)}&type=photo&preview=1`
    : null;
  const photoPreview = selectedPhotoPreview || savedPhoto;

  return <div className="relative min-h-screen overflow-hidden" style={{ backgroundImage: "url('/lovable-uploads/1c1f036d-97eb-4825-9766-e1ddb31b3f55.png')", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}>
    <div className="absolute inset-0 bg-black/40" />
    <nav className="relative z-10 border-b border-white/20 bg-white/10 shadow-sm backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center space-x-3 text-white transition-colors hover:text-gray-200"><ArrowLeft className="h-5 w-5" /><span>Back to Home</span></Link>
        <h1 className="text-xl font-semibold text-white">Manage Students</h1>
        <div className="w-24" />
      </div>
    </nav>
    <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-3xl font-bold text-white">Manage Students</h2><p className="mt-1 text-sm text-gray-200">Add, search, update, archive, and restore student records.</p></div>
      <div className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm text-white backdrop-blur-lg"><Users className="mr-2 inline h-4 w-4" />{students.filter(student => student.is_active).length} active students</div>
    </div>

    <div role="tablist" aria-label="Student sections" className="mb-6 inline-flex gap-1 rounded-lg border border-white/20 bg-black/20 p-1 shadow-sm backdrop-blur-lg">
      <button type="button" role="tab" id="new-student-tab" aria-selected={activeTab === "new"} aria-controls="new-student-panel" onClick={() => setActiveTab("new")} className={activeTab === "new" ? "rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm" : "rounded-md px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"}>New Student</button>
      <button type="button" role="tab" id="manage-students-tab" aria-selected={activeTab === "manage"} aria-controls="manage-students-panel" onClick={() => setActiveTab("manage")} className={activeTab === "manage" ? "rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm" : "rounded-md px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"}>Manage Students</button>
      <button type="button" role="tab" id="fee-plan-tab" aria-selected={activeTab === "fee-plan"} aria-controls="fee-plan-panel" onClick={() => setActiveTab("fee-plan")} className={activeTab === "fee-plan" ? "rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm" : "rounded-md px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"}>Fee Plan</button>
      <button type="button" role="tab" id="preview-student-tab" aria-selected={activeTab === "preview"} aria-controls="preview-student-panel" onClick={() => setActiveTab("preview")} className={activeTab === "preview" ? "rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm" : "rounded-md px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"}>Preview</button>
      <button type="button" role="tab" id="id-card-tab" aria-selected={activeTab === "id-card"} aria-controls="id-card-panel" onClick={() => setActiveTab("id-card")} className={activeTab === "id-card" ? "rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm" : "rounded-md px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"}>ID Card</button>
    </div>

    {activeTab === "new" && <section role="tabpanel" id="new-student-panel" aria-labelledby="new-student-tab">
    <Card className="mb-6 border-white/20 bg-white/10 backdrop-blur-lg"><CardHeader>
      <CardTitle className="text-white">{editingId ? "Edit Student Record" : "New Student"}</CardTitle>
      <CardDescription className="text-gray-200">Fields marked * are required. Only the last four Aadhaar digits are stored.</CardDescription>
    </CardHeader><CardContent><form onSubmit={submit} className="space-y-7">
      <Section title="Student Details">
        {field("first_name", "First Name", true)}{field("last_name", "Last Name")}{field("father_name", "Father’s Name", true)}
        {field("mother_name", "Mother’s Name")}{field("date_of_birth", "Date of Birth", true, "date")}
        <div className="space-y-2"><Label htmlFor="gender" className="text-white">Gender</Label><select id="gender" className="h-10 w-full rounded-md border border-white/30 bg-white/20 px-3 text-sm text-white" value={form.gender || "Male"} onChange={event => updateField("gender", event.target.value)}><option className="text-gray-900">Male</option><option className="text-gray-900">Female</option><option className="text-gray-900">Other</option></select></div>
        <div className="space-y-2"><Label htmlFor="category" className="text-white">Category</Label><select id="category" className="h-10 w-full rounded-md border border-white/30 bg-white/20 px-3 text-sm text-white" value={form.category || ""} onChange={event => updateField("category", event.target.value)}><option value="" className="text-gray-900">Select category</option>{["General", "OBC", "SC", "ST", "EWS", "Other"].map(item => <option key={item} className="text-gray-900">{item}</option>)}</select></div>
        {field("aadhaar_last4", "Aadhaar (last 4 digits)", false, "text", "Do not enter the full Aadhaar number.")}
        {field("phone", "Mobile Number", false, "tel")}{field("email", "Email", false, "email")}
        <div className="space-y-2 sm:col-span-2 lg:col-span-3"><Label htmlFor="address" className="text-white">Address</Label><Textarea id="address" className="border-white/30 bg-white/20 text-white placeholder:text-gray-300" value={form.address || ""} onChange={event => updateField("address", event.target.value)} rows={2} /></div>
      </Section>

      <Section title="Course / Class">
        <div className="space-y-2"><Label htmlFor="course_name" className="text-white">Course / Class *</Label><select id="course_name" required className="h-10 w-full rounded-md border border-white/30 bg-white/20 px-3 text-sm text-white" value={form.course_name || ""} onChange={event => { const course = event.target.value; setForm(current => ({ ...current, course_name: course, course_duration_months: courseDurationMonths(course) })); }}>
          <option value="" className="text-gray-900">Select certificate course</option>
          {editingId && form.course_name && !certificateCourseOptions.includes(form.course_name) && <option className="text-gray-900" value={form.course_name}>{form.course_name} (existing record)</option>}
          {certificateCourseOptions.map(course => <option className="text-gray-900" key={course} value={course}>{course}</option>)}
        </select></div>
        <div className="space-y-2"><Label htmlFor="course-duration-months" className="text-white">Course Duration (Months) *</Label><Input id="course-duration-months" type="number" min="1" max="120" required value={form.course_duration_months ?? ""} onChange={event => updateField("course_duration_months", event.target.value)} className="border-white/30 bg-white/20 text-white" /><p className="text-xs text-gray-200">Automatically filled from the course; adjust only when this student has a different duration.</p></div>
        {field("session_year", "Session Year (YYYY)", false, "text", "Enter a four-digit year, for example 2026.")}{field("roll_no", "Roll Number", false, "text", "Used in the Enrollment No.")}
        {field("section_batch", "Section / Batch")}
        <div className="space-y-2"><Label htmlFor="batch_timing" className="text-white">Batch Timing</Label><select id="batch_timing" className="h-10 w-full rounded-md border border-white/30 bg-white/20 px-3 text-sm text-white" value={form.batch_timing || ""} onChange={event => updateField("batch_timing", event.target.value)}><option value="" className="text-gray-900">Select batch timing</option>{batchTimings.map(timing => <option key={timing} value={timing} className="text-gray-900">{timing}</option>)}</select></div>
        {field("admission_date", "Admission Date", false, "date")}
      </Section>

      <Section title="Fee Plan" id="student-fees">
        {field("one_time_fee", "Admission Fee (₹)", false, "number", "Due on the admission date.")}
        {field("monthly_fee", "Monthly Fee (₹)", false, "number", "This amount is multiplied by the course duration.")}
        <div className="space-y-2"><Label className="flex items-center gap-2 text-white"><input type="checkbox" checked={Boolean(form.waive_last_two_months)} onChange={event => setForm(current => ({ ...current, waive_last_two_months: event.target.checked ? 1 : 0 }))} />Waive the final two monthly installments</Label><p className="text-xs text-gray-200">The waived months remain visible in the plan and are excluded from the total.</p></div>
        <div className="rounded-md border border-white/20 bg-white/5 p-3 text-sm text-white"><strong>Estimated plan total:</strong> ₹{estimatedPlanTotal.toLocaleString("en-IN")} <span className="text-gray-300">certificate fee and re-exam fee are added only when activated</span></div>
      </Section>

      <section className="space-y-4"><h3 className="border-b border-white/20 pb-2 text-lg font-semibold text-white">Student Photo</h3>
        <p className="text-sm text-gray-200">A student photo is required. Use JPG, PNG, or WebP, up to 5 MB.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[documentField].map(item => {
          const current = documents.find(document => document.document_type === item.type);
          return <div className="flex flex-wrap items-start gap-4 rounded-md border border-white/20 bg-white/5 p-3 sm:col-span-2 lg:col-span-3" key={item.type}>
            <div className="flex h-40 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/30 bg-white/10">
              {photoPreview ? <img src={photoPreview} alt="Student photo preview" className="h-full w-full object-cover" /> : <div className="flex flex-col items-center gap-2 text-gray-300"><Image className="h-8 w-8" /><span className="text-xs">Photo preview</span></div>}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={`file-${item.type}`} className="text-white">{item.label} *</Label>
            {current && editingId && <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span className="flex min-w-0 items-center gap-1 truncate text-gray-200"><FileText className="h-3.5 w-3.5 shrink-0" />{current.file_name}</span>
              <div className="flex shrink-0 gap-1"><a className="inline-flex items-center rounded border border-white/30 px-2 py-1 text-white hover:bg-white/10" href={`/api/students/files?student_id=${encodeURIComponent(editingId)}&type=${item.type}`} aria-label={`Download ${item.label}`}><Download className="h-3.5 w-3.5" /></a>
                <Button type="button" size="sm" variant="outline" aria-label={`Delete ${item.label}`} onClick={async () => { try { await requestDocuments(editingId, "DELETE", item.type); await loadDocuments(editingId); toast({ title: `${item.label} deleted` }); } catch (cause) { toast({ title: "Could not delete document", description: cause instanceof Error ? cause.message : "Please try again.", variant: "destructive" }); } }}><Trash2 className="h-3.5 w-3.5" /></Button></div>
            </div>}
            <Input id={`file-${item.type}`} type="file" accept={item.accept} required={!current} className="border-white/30 bg-white/20 text-white file:text-gray-900" onChange={event => setDocumentFiles(currentFiles => ({ ...currentFiles, [item.type]: event.target.files?.[0] || null }))} />
            {documentFiles[item.type] && <p className="truncate text-xs text-gray-200">Selected: {documentFiles[item.type]?.name}</p>}
            </div>
          </div>;
        })}</div>
      </section>
      <div className="space-y-2"><Label htmlFor="notes" className="text-white">Notes</Label><Textarea id="notes" className="border-white/30 bg-white/20 text-white placeholder:text-gray-300" value={form.notes || ""} onChange={event => updateField("notes", event.target.value)} rows={2} /></div>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving}><Plus className="mr-2 h-4 w-4" />{saving ? "Saving…" : editingId ? "Save Changes" : "Save Student"}</Button>
        <Button type="submit" data-create-id-card="true" disabled={saving} className="bg-gradient-to-r from-indigo-600 to-violet-700 text-white hover:from-indigo-700 hover:to-violet-800"><CreditCard className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save & Generate ID Card"}</Button>
        {editingId && <Button type="button" variant="outline" onClick={resetForm}><X className="mr-2 h-4 w-4" />Cancel Edit</Button>}
      </div>
    </form></CardContent></Card>
    </section>}

    {activeTab === "manage" && <section role="tabpanel" id="manage-students-panel" aria-labelledby="manage-students-tab">
    <Card className="border-white/20 bg-white/10 backdrop-blur-lg"><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><CardTitle className="text-white">Student Records</CardTitle><CardDescription className="text-gray-200">Search by name, roll number, batch, course, session, or contact.</CardDescription></div>
      <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} />Show archived students</label>
    </CardHeader><CardContent>
      <div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" /><Input className="border-white/30 bg-white/20 pl-9 text-white placeholder:text-gray-300" placeholder="Search student records" value={search} onChange={event => setSearch(event.target.value)} /></div>
      {error && <p role="alert" className="mb-3 text-sm text-red-200">{error}</p>}
      {loading ? <p className="py-8 text-center text-gray-200">Loading student records…</p> : filtered.length === 0 ? <p className="py-8 text-center text-gray-200">No student records found.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm text-white"><thead><tr className="border-b border-white/20 text-gray-200"><th className="px-3 py-3">Student</th><th className="px-3 py-3">Enrollment No.</th><th className="px-3 py-3">Course / Session</th><th className="px-3 py-3">Phone / Email</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th></tr></thead>
          <tbody>{filtered.map(student => <tr key={student.id} className="border-b border-white/10 last:border-0">
            <td className="px-3 py-3 font-medium">{student.student_name}<div className="text-xs font-normal text-gray-300">Father: {display(student.father_name)}</div></td>
            <td className="px-3 py-3 font-mono text-xs">{buildEnrollmentNo(student) || "—"}</td>
            <td className="px-3 py-3">{display(student.course_name)}<div className="text-xs text-gray-300">{formatSessionYear(student.session_year)}</div></td>
            <td className="px-3 py-3">{display(student.phone)}<div className="text-xs text-gray-300">{display(student.email)}</div></td>
            <td className="px-3 py-3"><span className={student.is_active ? "text-emerald-300" : "text-gray-300"}>{student.is_active ? "Active" : "Archived"}</span></td>
            <td className="px-3 py-3"><div className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap">
              <Button size="sm" aria-label={`Preview ${student.student_name}`} title="Preview Student" onClick={() => { setPreviewStudentId(student.id); setActiveTab("preview"); }} className="h-8 w-8 shrink-0 p-0 bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 text-white shadow-lg transition-all duration-300 hover:scale-105"><Eye className="h-4 w-4" /></Button>
              {student.is_active && <Button size="sm" aria-label={`Edit ${student.student_name}`} title="Edit Student" onClick={() => edit(student)} className="h-8 w-8 shrink-0 p-0 bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-lg transition-all duration-300 hover:scale-105"><Edit className="h-4 w-4" /></Button>}
              {student.is_active ? <Button size="sm" aria-label={`Archive ${student.student_name}`} title="Archive Student" onClick={() => setActive(student, false)} className="h-8 w-8 shrink-0 p-0 bg-gradient-to-r from-amber-500 to-amber-700 hover:from-amber-600 hover:to-amber-800 text-white shadow-lg transition-all duration-300 hover:scale-105"><Archive className="h-4 w-4" /></Button> : <Button size="sm" aria-label={`Restore ${student.student_name}`} title="Restore Student" onClick={() => setActive(student, true)} className="h-8 w-8 shrink-0 p-0 bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white shadow-lg transition-all duration-300 hover:scale-105"><RotateCcw className="h-4 w-4" /></Button>}
              <Button size="sm" aria-label={`Permanently delete ${student.student_name}`} title="Delete Student" onClick={() => { setStudentToDelete(student); setDeletePassword(""); setDeleteError(""); }} className="h-8 w-8 shrink-0 p-0 bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white shadow-lg transition-all duration-300 hover:scale-105"><Trash2 className="h-4 w-4" /></Button>
            </div></td>
          </tr>)}</tbody></table></div>}
    </CardContent></Card>
    </section>}

    {activeTab === "fee-plan" && <section role="tabpanel" id="fee-plan-panel" aria-labelledby="fee-plan-tab">
      <Card className="border-white/20 bg-white/10 backdrop-blur-lg"><CardHeader>
        <CardTitle className="text-white">Student Fee Plan</CardTitle>
        <CardDescription className="text-gray-200">Search by roll number to review dues, payments, receipts, and upcoming installments.</CardDescription>
      </CardHeader><CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="fee-plan-search" className="text-white">Search student by Roll Number</Label><Input id="fee-plan-search" value={feePlanSearch} onChange={event => setFeePlanSearch(event.target.value)} placeholder="Enter roll number" className="border-white/30 bg-white/20 text-white placeholder:text-gray-300" /></div>
          <div className="space-y-2"><Label htmlFor="fee-plan-student" className="text-white">Select Student</Label><select id="fee-plan-student" value={feePlanStudentId} onChange={event => setFeePlanStudentId(event.target.value)} className="h-10 w-full rounded-md border border-white/30 bg-white/20 px-3 text-sm text-white"><option value="" className="text-slate-900">Select a student</option>{matchingFeeStudents.map(student => <option key={student.id} value={student.id} className="text-slate-900">{student.roll_no || "No roll number"} · {student.student_name}</option>)}</select></div>
        </div>
        {feePlanError && <p role="alert" className="rounded-md border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-100">{feePlanError}</p>}
        {feePlanLoading ? <p className="py-8 text-center text-gray-200">Loading fee plan…</p> : !feePlanStudentId ? <p className="py-8 text-center text-gray-200">Search and select a student to view the fee plan.</p> : feePlan && <>
          <div className="rounded-lg border border-white/20 bg-white/5 p-4"><h3 className="font-semibold text-white">{feePlan.student_name} · {feePlan.roll_no || "No roll number"}</h3><p className="text-sm text-gray-300">{feePlan.course_name || "—"} · {feePlan.duration_months} months</p></div>
          {!feePlan.configured && <p role="alert" className="rounded-md border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">Fee plan is incomplete. Set a monthly fee and course duration before issuing a final marksheet or certificate.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/20 bg-white/5 p-4"><p className="text-sm text-gray-300">Total Plan</p><p className="mt-1 text-xl font-bold text-white">{feeMoney(feePlan.total_amount)}</p></div>
            <div className="rounded-lg border border-white/20 bg-white/5 p-4"><p className="text-sm text-gray-300">Paid</p><p className="mt-1 text-xl font-bold text-emerald-300">{feeMoney(feePlan.paid_amount)}</p></div>
            <div className="rounded-lg border border-white/20 bg-white/5 p-4"><p className="text-sm text-gray-300">Due / Pending</p><p className="mt-1 text-xl font-bold text-amber-200">{feeMoney(feePlan.pending_amount)}</p></div>
            <div className="rounded-lg border border-white/20 bg-white/5 p-4"><p className="text-sm text-gray-300">Upcoming</p><p className="mt-1 text-xl font-bold text-red-300">{feeMoney(feePlan.upcoming_amount)}</p></div>
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-white/20 bg-white/5 p-4">
            <div className="mr-auto"><h3 className="font-semibold text-white">Re-exam Fee</h3><p className="text-sm text-gray-300">Inactive until you activate it for this student.</p></div>
            <div className="space-y-1"><Label htmlFor="reexam-fee-amount" className="text-xs text-gray-200">Amount (₹)</Label><Input id="reexam-fee-amount" type="number" min="0.01" step="0.01" value={reexamAmount} onChange={event => setReexamAmount(event.target.value)} className="w-40 border-white/30 bg-white/20 text-white" /></div>
            <Button type="button" disabled={reexamBusy || !reexamAmount} onClick={() => void activateReexamFee()} className="bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-lg hover:from-blue-600 hover:to-blue-800">{reexamBusy ? "Activating…" : "Activate Re-exam Fee"}</Button>
          </div>
          {!feePlan.items.some(item => item.fee_category === "Certificate Issue Fee") && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/20 bg-white/5 p-4">
            <div className="mr-auto"><h3 className="font-semibold text-white">Certificate Issue Fee</h3><p className="text-sm text-gray-300">Inactive by default. Activate the fixed ₹250 fee when it is required.</p></div>
            <Button type="button" disabled={certificateFeeBusy} onClick={() => void activateCertificateFee()} className="bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-lg hover:from-blue-600 hover:to-blue-800">{certificateFeeBusy ? "Activating…" : "Activate ₹250 Fee"}</Button>
          </div>}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/15 bg-white/5 p-4">
            <div className="mr-auto"><h3 className="font-semibold text-white">Fee Payment</h3><p className="text-sm text-gray-300">Select due or upcoming monthly installments, or collect all remaining fees in one receipt. Admission Fee must be paid before Monthly Fee; while it is unpaid, collect the Admission Fee first.</p></div>
            <Button asChild disabled={!selectedPlanItems.length || admissionFeeOutstanding > 0.001} className="bg-gradient-to-r from-blue-500 to-blue-700 text-white hover:from-blue-600 hover:to-blue-800"><Link to={selectedPlanItems.length ? planCollectionHref(selectedPlanItems) : "#"}>Collect Selected ({feeMoney(selectedPlanItems.reduce((sum, item) => sum + item.remaining_amount, 0))})</Link></Button>
            <Button asChild disabled={!outstandingPlanItems.length || (admissionFeeOutstanding > 0.001 && outstandingPlanItems.some(item => item.fee_category === "Monthly Fee"))} variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20"><Link to={outstandingPlanItems.length ? planCollectionHref(outstandingPlanItems) : "#"}>Pay All Remaining Fees ({feeMoney(outstandingPlanItems.reduce((sum, item) => sum + item.remaining_amount, 0))})</Link></Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-white/15"><table className="w-full min-w-[900px] text-left text-sm text-white"><thead><tr className="border-b border-white/20 text-gray-200"><th className="px-3 py-3">Fee</th><th className="px-3 py-3">Due Date</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Receipts</th><th className="px-3 py-3">Action</th></tr></thead><tbody>
            {feePlan.items.map(item => <tr key={item.id} className="border-b border-white/10 last:border-0"><td className="px-3 py-3 font-medium">{item.fee_category === "Monthly Fee" && (item.status === "pending" || item.status === "upcoming") && !item.is_waived && item.remaining_amount > 0 && <input type="checkbox" aria-label={"Select " + item.description + (item.period ? " " + item.period : "") + " for combined payment"} checked={selectedFeePlanItemIds.includes(item.id)} disabled={admissionFeeOutstanding > 0.001} onChange={event => setSelectedFeePlanItemIds(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} className="mr-2 align-middle accent-emerald-500" />}{item.description}{item.period && <div className="text-xs text-gray-300">{item.period}</div>}</td><td className="px-3 py-3 whitespace-nowrap">{formatIndianDate(item.due_date)}</td><td className="px-3 py-3">{feeMoney(item.amount)}{item.remaining_amount > 0 && item.remaining_amount < item.amount && <div className="text-xs text-gray-300">Balance {feeMoney(item.remaining_amount)}</div>}</td><td className="px-3 py-3"><span className="inline-flex items-center gap-2"><span className={"h-2.5 w-2.5 rounded-full " + (item.status === "paid" ? "bg-emerald-400" : item.status === "pending" ? "bg-amber-300" : item.status === "upcoming" ? "bg-red-400" : "bg-gray-300")} />{item.status === "paid" ? "Paid" : item.status === "pending" ? "Pending" : item.status === "upcoming" ? "Upcoming" : "Waived"}</span></td><td className="px-3 py-3">{item.receipts.length ? <div className="space-y-1">{item.receipts.map(receipt => <div key={receipt.id} className="whitespace-nowrap text-xs"><span className="font-medium">{receipt.receipt_no}</span>{receipt.mr_number && <span> · MR {receipt.mr_number}</span>} · {formatIndianDate(receipt.payment_date)} <Link className="ml-1 text-emerald-300 underline" to={"/fees?receipt=" + encodeURIComponent(receipt.id)}>Print</Link></div>)}</div> : "—"}</td><td className="px-3 py-3">{!item.is_waived && item.remaining_amount > 0 && (item.status === "pending" || item.status === "upcoming") ? item.fee_category === "Monthly Fee" && admissionFeeOutstanding > 0.001 ? <span className="text-xs text-amber-200">Pay admission first</span> : <Button asChild size="sm" className="bg-gradient-to-r from-emerald-500 to-emerald-700 text-white hover:from-emerald-600 hover:to-emerald-800"><Link to={"/fees?student_id=" + encodeURIComponent(feePlan.student_id) + "&plan_item_id=" + encodeURIComponent(item.id)}>Collect</Link></Button> : "—"}</td></tr>)}
          </tbody></table></div>
          <div className="rounded-lg border border-white/20 bg-white/5 p-4">
            <h3 className="font-semibold text-white">Other Deposits</h3>
            <p className="mb-3 text-xs text-gray-300">Separate charges and deposits are recorded here, outside the main fee plan.</p>
            {otherDeposits.length ? <div className="space-y-2">{otherDeposits.map(deposit => <div key={deposit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white"><div><span className="font-semibold">{deposit.receipt_no}</span><span className="ml-2 text-gray-300">· {formatIndianDate(deposit.payment_date)} · {deposit.payment_method}{deposit.mr_number ? " · MR " + deposit.mr_number : ""}</span>{deposit.notes && <p className="text-xs text-gray-300">{deposit.notes}</p>}</div><span className="font-semibold">{feeMoney(deposit.amount)}</span></div>)}</div> : <p className="text-sm text-gray-300">No other deposits recorded.</p>}
          </div>
        </>}
      </CardContent></Card>
    </section>}
    {activeTab === "preview" && <section role="tabpanel" id="preview-student-panel" aria-labelledby="preview-student-tab">
      {previewStudentId ? <StudentPreview studentId={previewStudentId} embedded /> : <Card aria-label="Student preview is empty" className="min-h-64 border-white/20 bg-white/10 backdrop-blur-lg"><CardContent className="min-h-64" /></Card>}
    </section>}
    {activeTab === "id-card" && <section role="tabpanel" id="id-card-panel" aria-labelledby="id-card-tab" className="space-y-6">
      <Card className="border-white/20 bg-white/10 backdrop-blur-lg"><CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-white">ID Card Preview</CardTitle><CardDescription className="text-gray-200">Select an ID card below to preview it. Enrollment No. is the card’s primary identifier.</CardDescription></div>
        <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void printIdCard()} disabled={!printAllowed} className="bg-gradient-to-r from-emerald-600 to-green-700 text-white hover:from-emerald-700 hover:to-green-800">Print</Button><Button type="button" onClick={() => void downloadIdCard()} disabled={!printAllowed} className="bg-gradient-to-r from-blue-600 to-blue-800 text-white hover:from-blue-700 hover:to-blue-900">Download PDF</Button></div>
      </CardHeader><CardContent className="space-y-4">
        {idCardNotice && <p role="alert" className="text-sm text-red-200">{idCardNotice}</p>}
        <div ref={idCardPreviewRef} className="mx-auto w-full max-w-[360px]">{selectedIdCard ? <StudentIdCard card={selectedIdCard} photoUrl={"/api/students/files?student_id=" + encodeURIComponent(selectedIdCard.student_id) + "&type=photo&preview=1"} /> : <div className="flex aspect-[1.586] w-full items-center justify-center rounded-2xl border border-dashed border-white/30 bg-white/5 text-gray-300">Select an ID card to preview</div>}</div>
        {selectedIdCard && <div className="mx-auto flex max-w-[360px] flex-wrap items-center justify-between gap-3 rounded-lg border border-white/20 bg-white/5 p-3">
          <div className="text-sm text-white"><span className="font-semibold">Enrollment No.:</span> {selectedIdCard.registration_no}<span className={selectedIdCard.student_active ? "ml-3 text-emerald-300" : "ml-3 text-amber-200"}>{selectedIdCard.student_active ? "Active" : "Archived"}</span></div>
          <div className="flex gap-2"><Button type="button" size="sm" variant="destructive" onClick={() => { setCardToDelete(selectedIdCard); setCardDeletePassword(""); setCardDeleteError(""); }}>Delete</Button></div>
        </div>}
        
      </CardContent></Card>

      <Card className="border-white/20 bg-white/10 backdrop-blur-lg"><CardHeader><CardTitle className="text-white">Manage ID Cards</CardTitle><CardDescription className="text-gray-200">Student archive status is reflected automatically on the linked ID card.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-white/20 bg-white/5 p-3"><div className="min-w-56 flex-1 space-y-2"><Label htmlFor="id-card-student" className="text-white">Create ID card for an existing student</Label><select id="id-card-student" value={idCardStudentToCreate} onChange={event => setIdCardStudentToCreate(event.target.value)} className="h-10 w-full rounded-md border border-white/30 bg-white/20 px-3 text-sm text-white"><option value="" className="text-gray-900">Select student</option>{studentsWithoutCards.map(student => <option key={student.id} value={student.id} className="text-gray-900">{student.student_name} · {buildEnrollmentNo(student) || "Enrollment No. not ready"}</option>)}</select></div><Button type="button" disabled={!idCardStudentToCreate || idCardBusy} onClick={() => void createIdCardForStudent()} className="bg-gradient-to-r from-indigo-600 to-violet-700 text-white hover:from-indigo-700 hover:to-violet-800"><CreditCard className="mr-2 h-4 w-4"/>{idCardBusy ? "Creating…" : "Create ID Card"}</Button></div>
        {idCardLoading ? <p className="py-6 text-center text-gray-200">Loading ID cards…</p> : idCards.length === 0 ? <p className="py-6 text-center text-gray-200">No ID cards created yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm text-white"><thead><tr className="border-b border-white/20 text-gray-200"><th className="px-3 py-3">Student</th><th className="px-3 py-3">Enrollment No.</th><th className="px-3 py-3">Course</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody>{idCards.map(card => <tr key={card.id} onClick={() => selectIdCard(card)} aria-selected={selectedIdCardId === card.id} className={selectedIdCardId === card.id ? "cursor-pointer border-b border-white/10 bg-white/15" : "cursor-pointer border-b border-white/10 hover:bg-white/10"}><td className="px-3 py-3 font-medium">{card.student_name}<div className="text-xs text-gray-300">Father: {display(card.father_name)}</div></td><td className="px-3 py-3 font-semibold">{card.registration_no}</td><td className="px-3 py-3">{display(card.course_name)}</td><td className={card.student_active ? "px-3 py-3 text-emerald-300" : "px-3 py-3 text-amber-200"}>{card.student_active ? "Active" : "Archived"}</td><td className="px-3 py-3"><div className="inline-flex justify-end gap-1" onClick={event => event.stopPropagation()}><Button size="sm" aria-label="Edit ID card" title="Edit ID card" onClick={() => { selectIdCard(card); setIdCardEditing(true); }} className="h-8 w-8 shrink-0 p-0 bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:from-blue-600 hover:to-blue-800"><Edit className="h-4 w-4"/></Button><Button size="sm" aria-label="Delete ID card" title="Delete ID card" onClick={() => { selectIdCard(card); setCardToDelete(card); setCardDeletePassword(""); setCardDeleteError(""); }} className="h-8 w-8 shrink-0 p-0 bg-gradient-to-r from-red-500 to-red-700 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:from-red-600 hover:to-red-800"><Trash2 className="h-4 w-4"/></Button></div></td></tr>)}</tbody></table></div>}
      </CardContent></Card>
    </section>}

    </main>
    <Dialog open={Boolean(studentToDelete)} onOpenChange={open => { if (!open && !deleting) { setStudentToDelete(null); setDeletePassword(""); setDeleteError(""); } }}>
      <DialogContent><DialogHeader><DialogTitle>Delete Student Permanently</DialogTitle><DialogDescription>This permanently deletes {studentToDelete?.student_name || "this student"} and their stored photo. Certificate and marksheet records are kept.</DialogDescription></DialogHeader>
        <form onSubmit={confirmDelete} className="space-y-4"><div className="space-y-2"><Label htmlFor="student-delete-password">Confirm your admin login password</Label><Input id="student-delete-password" type="password" autoComplete="current-password" value={deletePassword} onChange={event => { setDeletePassword(event.target.value); setDeleteError(""); }} required maxLength={1024} />{deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setStudentToDelete(null)} disabled={deleting}>Cancel</Button><Button type="submit" variant="destructive" disabled={!deletePassword || deleting}>{deleting ? "Deleting…" : "Delete permanently"}</Button></DialogFooter></form>
      </DialogContent></Dialog>
    <Dialog open={Boolean(cardToDelete)} onOpenChange={open => { if (!open && !cardDeleting) { setCardToDelete(null); setCardDeletePassword(""); setCardDeleteError(""); } }}>
      <DialogContent><DialogHeader><DialogTitle>Delete ID Card</DialogTitle><DialogDescription>Permanently delete the ID card for {cardToDelete?.student_name || "this student"}? The student record will remain.</DialogDescription></DialogHeader>
        <form onSubmit={confirmIdCardDelete} className="space-y-4"><div className="space-y-2"><Label htmlFor="id-card-delete-password">Confirm your admin login password</Label><Input id="id-card-delete-password" type="password" autoComplete="current-password" value={cardDeletePassword} onChange={event => { setCardDeletePassword(event.target.value); setCardDeleteError(""); }} required maxLength={1024} />{cardDeleteError && <p role="alert" className="text-sm text-destructive">{cardDeleteError}</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setCardToDelete(null)} disabled={cardDeleting}>Cancel</Button><Button type="submit" variant="destructive" disabled={!cardDeletePassword || cardDeleting}>{cardDeleting ? "Deleting…" : "Delete ID Card"}</Button></DialogFooter></form>
      </DialogContent></Dialog>
  </div>;
}
