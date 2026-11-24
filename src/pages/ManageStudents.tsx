import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArrowLeft, Pencil, Plus, RotateCcw, Search, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Student = {
  id: string; student_name: string; first_name: string | null; last_name: string | null;
  father_name: string | null; mother_name: string | null; gender: string | null; category: string | null;
  aadhaar_last4: string | null; roll_no: string | null; batch_code: string | null; section_batch: string | null;
  course_name: string | null; institute_name: string | null; session_year: string | null;
  admission_date: string | null; date_of_birth: string | null; phone: string | null; email: string | null;
  address: string | null; notes: string | null; one_time_fee: number | null; monthly_fee: number | null;
  referred_by: string | null; is_active: number;
};

type StudentForm = Omit<Student, "id" | "is_active">;
const today = new Date();
const dateInput = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const academicStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
const currentSession = `${academicStartYear}-${String(academicStartYear + 1).slice(-2)}`;
const emptyForm: StudentForm = {
  student_name: "", first_name: "", last_name: "", father_name: "", mother_name: "", gender: "Male", category: "",
  aadhaar_last4: "", roll_no: "", batch_code: "", section_batch: "", course_name: "", institute_name: "Masscom Infotech Education",
  session_year: currentSession, admission_date: dateInput, date_of_birth: "", phone: "", email: "", address: "", notes: "",
  one_time_fee: null, monthly_fee: null, referred_by: "",
};

async function request(method: string, id?: string, body?: object) {
  const response = await fetch(`/api/students${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to complete the request.");
  return data;
}

const display = (value: string | number | null) => value == null || value === "" ? "—" : String(value);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4"><h3 className="border-b pb-2 text-lg font-semibold">{title}</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div></section>;
}

export default function ManageStudents() {
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState<StudentForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter(student => (includeArchived || student.is_active) &&
      (!query || [student.student_name, student.father_name, student.roll_no, student.batch_code, student.course_name, student.phone, student.email, student.session_year]
        .some(value => value?.toLowerCase().includes(query))));
  }, [students, search, includeArchived]);

  const updateField = (field: keyof StudentForm, value: string) => setForm(current => ({ ...current, [field]: value }));
  const resetForm = () => { setForm(emptyForm); setEditingId(null); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const studentName = [form.first_name, form.last_name].filter(Boolean).join(" ").trim();
      await request(editingId ? "PUT" : "POST", editingId || undefined, { ...form, student_name: studentName, is_active: 1 });
      toast({ title: editingId ? "Student record updated" : "Student added" });
      resetForm(); await loadStudents();
    } catch (cause) {
      toast({ title: "Could not save student", description: cause instanceof Error ? cause.message : "Please try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const edit = (student: Student) => {
    setEditingId(student.id);
    const oldName = student.student_name.split(/\s+/);
    setForm({ ...emptyForm, ...student, first_name: student.first_name || oldName.shift() || "", last_name: student.last_name || oldName.join(" "),
      one_time_fee: student.one_time_fee ?? null, monthly_fee: student.monthly_fee ?? null,
      admission_date: student.admission_date || "", date_of_birth: student.date_of_birth || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setActive = async (student: Student, active: boolean) => {
    try {
      if (!active) await request("DELETE", student.id);
      else await request("PUT", student.id, { ...student, first_name: student.first_name || student.student_name, is_active: 1 });
      toast({ title: active ? "Student restored" : "Student archived" }); await loadStudents();
    } catch (cause) { toast({ title: "Could not update student", description: cause instanceof Error ? cause.message : "Please try again.", variant: "destructive" }); }
  };

  const field = (name: keyof StudentForm, label: string, required = false, type = "text", hint?: string) => <div className="space-y-2" key={name}>
    <Label htmlFor={name}>{label}{required ? " *" : ""}</Label>
    <Input id={name} type={type} value={form[name] == null ? "" : String(form[name])} onChange={event => updateField(name, event.target.value)} required={required} />
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
  </div>;

  return <main className="container mx-auto max-w-7xl px-4 py-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><Button asChild variant="ghost" className="mb-2 px-0 text-white hover:bg-white/10 hover:text-white"><Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Link></Button>
        <h1 className="text-3xl font-bold text-white">Manage Students</h1><p className="mt-1 text-sm text-slate-300">Add, search, update, archive, and restore student records.</p></div>
      <div className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white"><Users className="mr-2 inline h-4 w-4" />{students.filter(student => student.is_active).length} active students</div>
    </div>

    <Card className="mb-6 border-white/20 bg-white/95"><CardHeader>
      <CardTitle>{editingId ? "Edit Student Record" : "New Student"}</CardTitle>
      <CardDescription>Fields marked * are required. Only the last four Aadhaar digits are stored.</CardDescription>
    </CardHeader><CardContent><form onSubmit={submit} className="space-y-7">
      <Section title="Student Details">
        {field("first_name", "First Name", true)}{field("last_name", "Last Name")}{field("father_name", "Father’s Name", true)}
        {field("mother_name", "Mother’s Name")}{field("date_of_birth", "Date of Birth", true, "date")}
        <div className="space-y-2"><Label htmlFor="gender">Gender</Label><select id="gender" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.gender || "Male"} onChange={event => updateField("gender", event.target.value)}><option>Male</option><option>Female</option><option>Other</option></select></div>
        <div className="space-y-2"><Label htmlFor="category">Category</Label><select id="category" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.category || ""} onChange={event => updateField("category", event.target.value)}><option value="">Select category</option>{["General", "OBC", "SC", "ST", "EWS", "Other"].map(item => <option key={item}>{item}</option>)}</select></div>
        {field("aadhaar_last4", "Aadhaar (last 4 digits)", false, "text", "Do not enter the full Aadhaar number.")}
        {field("phone", "Mobile Number", false, "tel")}{field("email", "Email", false, "email")}
        <div className="space-y-2 sm:col-span-2 lg:col-span-3"><Label htmlFor="address">Address</Label><Textarea id="address" value={form.address || ""} onChange={event => updateField("address", event.target.value)} rows={2} /></div>
      </Section>

      <Section title="Course / Class">
        {field("institute_name", "Institute Name", false, "text", "Defaults to Masscom Infotech Education.")}{field("course_name", "Course / Class", true)}
        {field("session_year", "Session Year")}{field("roll_no", "Roll Number", false, "text", "Leave blank if you will assign it later.")}
        {field("section_batch", "Section / Batch")}{field("admission_date", "Admission Date", false, "date")}
      </Section>

      <Section title="Fee & Referral">
        {field("one_time_fee", "One-time Fee (₹)", false, "number", "Leave blank to use the course fee.")}
        {field("monthly_fee", "Monthly Fee (₹)", false, "number", "Record the monthly fee for this student.")}
        {field("referred_by", "Referred By (Enrollment No.)", false, "text", "Enrollment number of the student who referred them.")}
      </Section>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Photo and certificate uploads are not enabled yet. They need a private Cloudflare R2 file bucket before uploaded documents can be stored safely.</div>
      <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={form.notes || ""} onChange={event => updateField("notes", event.target.value)} rows={2} /></div>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving}><Plus className="mr-2 h-4 w-4" />{saving ? "Saving…" : editingId ? "Save Changes" : "Add Student"}</Button>
        {editingId && <Button type="button" variant="outline" onClick={resetForm}><X className="mr-2 h-4 w-4" />Cancel Edit</Button>}
      </div>
    </form></CardContent></Card>

    <Card className="border-white/20 bg-white/95"><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><CardTitle>Student Records</CardTitle><CardDescription>Search by name, roll number, batch, course, session, or contact.</CardDescription></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} />Show archived students</label>
    </CardHeader><CardContent>
      <div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input className="pl-9" placeholder="Search student records" value={search} onChange={event => setSearch(event.target.value)} /></div>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="py-8 text-center text-slate-500">Loading student records…</p> : filtered.length === 0 ? <p className="py-8 text-center text-slate-500">No student records found.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="px-3 py-3">Student</th><th className="px-3 py-3">Roll / Batch</th><th className="px-3 py-3">Course / Session</th><th className="px-3 py-3">Phone / Email</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th></tr></thead>
          <tbody>{filtered.map(student => <tr key={student.id} className="border-b last:border-0">
            <td className="px-3 py-3 font-medium">{student.student_name}<div className="text-xs font-normal text-slate-500">Father: {display(student.father_name)}</div></td>
            <td className="px-3 py-3">{display(student.roll_no)}<div className="text-xs text-slate-500">{display(student.section_batch || student.batch_code)}</div></td>
            <td className="px-3 py-3">{display(student.course_name)}<div className="text-xs text-slate-500">{display(student.session_year)}</div></td>
            <td className="px-3 py-3">{display(student.phone)}<div className="text-xs text-slate-500">{display(student.email)}</div></td>
            <td className="px-3 py-3"><span className={student.is_active ? "text-emerald-700" : "text-slate-500"}>{student.is_active ? "Active" : "Archived"}</span></td>
            <td className="px-3 py-3"><div className="flex justify-end gap-2">{student.is_active && <Button size="sm" variant="outline" onClick={() => edit(student)} aria-label={`Edit ${student.student_name}`}><Pencil className="h-4 w-4" /></Button>}
              {student.is_active ? <Button size="sm" variant="outline" onClick={() => setActive(student, false)} aria-label={`Archive ${student.student_name}`}><Archive className="h-4 w-4" /></Button> : <Button size="sm" variant="outline" onClick={() => setActive(student, true)} aria-label={`Restore ${student.student_name}`}><RotateCcw className="h-4 w-4" /></Button>}</div></td>
          </tr>)}</tbody></table></div>}
    </CardContent></Card>
  </main>;
}
