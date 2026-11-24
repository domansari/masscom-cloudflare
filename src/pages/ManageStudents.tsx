import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, ArrowLeft, Pencil, Plus, RotateCcw, Search, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Student = {
  id: string; student_name: string; father_name: string | null; roll_no: string | null;
  batch_code: string | null; course_name: string | null; admission_date: string | null;
  date_of_birth: string | null; phone: string | null; email: string | null;
  address: string | null; notes: string | null; is_active: number;
};

type StudentForm = Omit<Student, "id" | "is_active">;
const emptyForm: StudentForm = {
  student_name: "", father_name: "", roll_no: "", batch_code: "", course_name: "",
  admission_date: "", date_of_birth: "", phone: "", email: "", address: "", notes: "",
};

async function request(method: string, id?: string, body?: object) {
  const response = await fetch(`/api/students${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to complete the request.");
  return data;
}

const text = (value: string | null) => value || "—";

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
    try {
      const data = await request("GET");
      setStudents(data.data || []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load students.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadStudents(); }, [loadStudents]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter(student => (includeArchived || student.is_active) &&
      (!query || [student.student_name, student.father_name, student.roll_no, student.batch_code, student.course_name, student.phone, student.email]
        .some(value => value?.toLowerCase().includes(query))));
  }, [students, search, includeArchived]);

  const updateField = (field: keyof StudentForm, value: string) => setForm(current => ({ ...current, [field]: value }));
  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await request(editingId ? "PUT" : "POST", editingId || undefined, { ...form, is_active: 1 });
      toast({ title: editingId ? "Student record updated" : "Student added" });
      resetForm();
      await loadStudents();
    } catch (cause) {
      toast({ title: "Could not save student", description: cause instanceof Error ? cause.message : "Please try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const edit = (student: Student) => {
    setEditingId(student.id);
    setForm(Object.fromEntries(Object.keys(emptyForm).map(key => [key, student[key as keyof Student] || ""])) as StudentForm);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setActive = async (student: Student, active: boolean) => {
    try {
      if (!active) await request("DELETE", student.id);
      else await request("PUT", student.id, { ...Object.fromEntries(Object.keys(emptyForm).map(key => [key, student[key as keyof Student] || ""])), is_active: 1 });
      toast({ title: active ? "Student restored" : "Student archived" });
      await loadStudents();
    } catch (cause) {
      toast({ title: "Could not update student", description: cause instanceof Error ? cause.message : "Please try again.", variant: "destructive" });
    }
  };

  return <main className="container mx-auto max-w-7xl px-4 py-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <Button asChild variant="ghost" className="mb-2 px-0 text-white hover:bg-white/10 hover:text-white"><Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Link></Button>
        <h1 className="text-3xl font-bold text-white">Manage Students</h1>
        <p className="mt-1 text-sm text-slate-300">Add and maintain student records for Masscom.</p>
      </div>
      <div className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white"><Users className="mr-2 inline h-4 w-4" />{students.filter(student => student.is_active).length} active students</div>
    </div>

    <Card className="mb-6 border-white/20 bg-white/95">
      <CardHeader>
        <CardTitle>{editingId ? "Edit Student Record" : "Add Student"}</CardTitle>
        <CardDescription>Enter the student’s personal and course details. Only the student name is required.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ["student_name", "Student Name", true], ["father_name", "Father’s Name"], ["roll_no", "Roll Number"],
              ["batch_code", "Batch Code"], ["course_name", "Course"], ["admission_date", "Admission Date"],
              ["date_of_birth", "Date of Birth"], ["phone", "Phone Number"], ["email", "Email"],
            ] as const).map(([field, label, required]) => <div key={field} className="space-y-2">
              <Label htmlFor={field}>{label}{required ? " *" : ""}</Label>
              <Input id={field} type={field.includes("date") ? "date" : field === "email" ? "email" : "text"} value={form[field] || ""} onChange={event => updateField(field, event.target.value)} required={required} />
            </div>)}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="address">Address</Label><Textarea id="address" value={form.address || ""} onChange={event => updateField("address", event.target.value)} rows={2} /></div>
            <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={form.notes || ""} onChange={event => updateField("notes", event.target.value)} rows={2} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}><Plus className="mr-2 h-4 w-4" />{saving ? "Saving…" : editingId ? "Save Changes" : "Add Student"}</Button>
            {editingId && <Button type="button" variant="outline" onClick={resetForm}><X className="mr-2 h-4 w-4" />Cancel Edit</Button>}
          </div>
        </form>
      </CardContent>
    </Card>

    <Card className="border-white/20 bg-white/95">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><CardTitle>Student Records</CardTitle><CardDescription>Search by name, roll number, batch, course, or contact.</CardDescription></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} />Show archived students</label>
      </CardHeader>
      <CardContent>
        <div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input className="pl-9" placeholder="Search student records" value={search} onChange={event => setSearch(event.target.value)} /></div>
        {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
        {loading ? <p className="py-8 text-center text-slate-500">Loading student records…</p> : filtered.length === 0 ? <p className="py-8 text-center text-slate-500">No student records found.</p> :
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="px-3 py-3">Student</th><th className="px-3 py-3">Roll / Batch</th><th className="px-3 py-3">Course</th><th className="px-3 py-3">Phone / Email</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th></tr></thead>
            <tbody>{filtered.map(student => <tr key={student.id} className="border-b last:border-0">
              <td className="px-3 py-3 font-medium">{student.student_name}<div className="text-xs font-normal text-slate-500">Father: {text(student.father_name)}</div></td>
              <td className="px-3 py-3">{text(student.roll_no)}<div className="text-xs text-slate-500">{text(student.batch_code)}</div></td>
              <td className="px-3 py-3">{text(student.course_name)}</td>
              <td className="px-3 py-3">{text(student.phone)}<div className="text-xs text-slate-500">{text(student.email)}</div></td>
              <td className="px-3 py-3"><span className={student.is_active ? "text-emerald-700" : "text-slate-500"}>{student.is_active ? "Active" : "Archived"}</span></td>
              <td className="px-3 py-3"><div className="flex justify-end gap-2">
                {student.is_active && <Button size="sm" variant="outline" onClick={() => edit(student)} aria-label={`Edit ${student.student_name}`}><Pencil className="h-4 w-4" /></Button>}
                {student.is_active ? <Button size="sm" variant="outline" onClick={() => setActive(student, false)} aria-label={`Archive ${student.student_name}`}><Archive className="h-4 w-4" /></Button> : <Button size="sm" variant="outline" onClick={() => setActive(student, true)} aria-label={`Restore ${student.student_name}`}><RotateCcw className="h-4 w-4" /></Button>}
              </div></td>
            </tr>)}</tbody>
          </table></div>}
      </CardContent>
    </Card>
  </main>;
}
