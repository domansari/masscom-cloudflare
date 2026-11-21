import { examCourseCode, examCourses, examResult, marksheetResult, passingMark } from "../../functions/api/_exam-courses.js";
import { ArrowLeft, ArrowDown, ArrowUp, ArrowUpDown, Download, Edit, FileBadge, FilePlus, Printer, Search, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CertificatePagination } from "@/components/manage-certificates/CertificatePagination";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

type Sheet = { id: string; registration_no: string; student_name: string; father_name: string | null; issued_on: string; first_terminal: number; second_terminal: number; third_terminal: number | null; exam_course: keyof typeof examCourses; certificate_ref: string | null };
type Certificate = { id: string; certificate_id: string; student_name: string; roll_no?: string; batch_number?: string; course_name: string };
const sortColumns = [
  ["student_name", "Student Name"],
  ["registration_no", "Registration No."],
  ["issued_on", "Issue Date"],
  ["first_terminal", "1st Terminal"],
  ["second_terminal", "2nd Terminal"],
  ["third_terminal", "3rd Terminal"],
] as const;
type SortField = (typeof sortColumns)[number][0];
const pageSize = 10;
const actionStyle = "h-8 w-8 shrink-0 p-0 text-white shadow-lg transition-all duration-300 hover:scale-105";

const emptyForm = { roll_no: "", batch_code: "", year: "", certificate_ref: "", student_name: "", father_name: "", issued_on: "", first_terminal: "", second_terminal: "", third_terminal: "" };
const normalize = (value?: string) => (value ?? "").trim().toLowerCase();

function download(sheet: Sheet) {
  const pdf = new jsPDF({ unit: "mm", format: "letter" });
  const score = marksheetResult(sheet);
  pdf.setLineWidth(0.6);
  pdf.rect(11, 11, 194, 257);
  pdf.setFontSize(17);
  pdf.text("MASSCOM INFOTECH EDUCATION", 108, 29, { align: "center" });
  pdf.setFontSize(14);
  pdf.text("Statement of Marks", 108, 40, { align: "center" });
  pdf.setFontSize(11);
  const lines = [
    ...pdf.splitTextToSize(`Registration No.  ${sheet.registration_no}`, 166),
    ...pdf.splitTextToSize(`Student name  ${sheet.student_name}`, 166),
    `Course  ${examCourses[sheet.exam_course].name}`,
  ];
  pdf.text(lines, 23, 57);
  let y = 62 + lines.length * 5;
  pdf.text("Course / Subject / Module", 23, y);
  pdf.text("Maximum", 148, y);
  pdf.text("Secured", 178, y);
  for (const [key, label, modules] of examCourses[sheet.exam_course].modules) {
    pdf.line(23, y + 3, 193, y + 3);
    y += 12;
    pdf.text(label, 23, y);
    pdf.text("100", 154, y);
    pdf.text(String(sheet[key]), 182, y);
    pdf.text(pdf.splitTextToSize(modules, 112), 23, y + 6);
    y += 18;
  }
  pdf.text(`Total: ${score.total}/${score.maximum}    Percentage: ${score.percentage}%    Grade: ${score.grade}`, 23, y + 7);
  pdf.text("Passing requirement: at least 33/100 in each required exam.", 23, y + 17);
  pdf.text("Prepared By", 23, 245);
  pdf.text(`Date of Issue: ${sheet.issued_on}`, 79, 245);
  pdf.text("Controller of Examination", 146, 245);
  pdf.save(`${sheet.exam_course.toUpperCase()}-${sheet.registration_no.replace(/[^a-z0-9_-]/gi, "-")}.pdf`);
}

function printMarkSheet(sheet: Sheet) {
  const printWindow = window.open("", "_blank", "popup,width=850,height=720");
  if (!printWindow) return false;
  const document = printWindow.document;
  const score = marksheetResult(sheet);
  const appendText = (tag: string, text: string, parent: HTMLElement = document.body) => {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
  };

  document.title = "Print Marksheet";
  appendText("style", `
    @page { size: A4; margin: 15mm; }
    body { font: 15px system-ui, sans-serif; color: #111; border: 2px solid #333; padding: 24px; }
    h1, h2 { text-align: center; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th, td { text-align: left; border: 1px solid #aaa; padding: 10px; }
    footer { display: flex; justify-content: space-between; margin-top: 56px; }
  `, document.head);
  appendText("h1", "MASSCOM INFOTECH EDUCATION");
  appendText("h2", "Statement of Marks");
  appendText("p", `Registration No. ${sheet.registration_no}`);
  appendText("p", `Student Name: ${sheet.student_name}`);
  appendText("p", examCourses[sheet.exam_course].name);

  const table = document.createElement("table");
  document.body.append(table);
  const headings = table.createTHead().insertRow();
  for (const heading of ["Terminal / Course Content", "Maximum Marks", "Marks Secured"]) {
    appendText("th", heading, headings);
  }
  const body = table.createTBody();
  for (const [key, label, modules] of examCourses[sheet.exam_course].modules) {
    const row = body.insertRow();
    appendText("strong", label, row.insertCell());
    appendText("div", modules, row.cells[0]);
    row.insertCell().textContent = "100";
    row.insertCell().textContent = String(sheet[key]);
  }
  appendText("p", `Total: ${score.total}/${score.maximum} · Percentage: ${score.percentage}% · Result: ${score.pass ? "Pass" : "Fail"} · Grade: ${score.grade}`);
  appendText("p", "Passing requirement: at least 33/100 in each required exam.");
  const footer = appendText("footer", "");
  appendText("span", "Prepared By", footer);
  appendText("span", `Date of Issue: ${sheet.issued_on}`, footer);
  appendText("span", "Controller of Examination", footer);
  printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
  printWindow.focus();
  printWindow.print();
  return true;
}

async function request(method = "GET", id?: string, body?: object) {
  const response = await fetch(`/api/marksheets${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to complete the request.");
  return data;
}

export default function MarkSheets({ manage = false }: { manage?: boolean }) {
  const [params] = useSearchParams();
  const certificateId = params.get("certificate");
  return <MarkSheetWorkspace key={certificateId ?? (manage ? "manage" : "create")} manage={manage} certificateId={certificateId} />;
}

function MarkSheetWorkspace({ manage, certificateId }: { manage: boolean; certificateId: string | null }) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const showSaved = manage || Boolean(certificateId);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("issued_on");
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState("");
  const previewOnly = Boolean(certificateId);
  const [loading, setLoading] = useState(true);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [editingCourse, setEditingCourse] = useState<keyof typeof examCourses>("dca");
  const terminals = examCourses[editingCourse].modules;
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function refresh() {
    setSheets((await request()).data);
  }

  useEffect(() => {
    if (!showSaved) return;
    refresh().catch((error: Error) => setLoadError(error.message)).finally(() => setLoading(false));
  }, [showSaved]);

  useEffect(() => {
    if (previewOnly || (manage && !editing)) return;
    let active = true;
    fetch("/api/certificates").then(async response => {
      if (!response.ok) throw new Error("Could not load certificates for linking.");
      const { data } = await response.json() as { data: Certificate[] };
      if (!active) return;
      setCertificates(data.filter(certificate => examCourseCode(certificate.course_name)));

    }).catch((error: Error) => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [previewOnly, manage, editing]);

  function edit(sheet: Sheet) {
    setNotice("");
    const [roll_no = "", batch_code = "", year = ""] = sheet.registration_no.split("/");
    setEditing(sheet.id);
    setEditingCourse(sheet.exam_course);
    setForm({
      ...emptyForm, roll_no, batch_code, year, certificate_ref: sheet.certificate_ref ?? "",
      student_name: sheet.student_name, father_name: sheet.father_name ?? "", issued_on: sheet.issued_on,
      first_terminal: String(sheet.first_terminal), second_terminal: String(sheet.second_terminal), third_terminal: String(sheet.third_terminal ?? ""),
    });
  }

  function reset() {
    setEditing(undefined);
    setEditingCourse("dca");
    setForm(emptyForm);
  }

  async function change(method: string, id?: string, values?: object, createCertificate = false) {
    setBusy(true);
    try {
      const saved = await request(method, id, values);
      if (createCertificate) {
        navigate(`/generate?marksheet=${encodeURIComponent(saved.id)}`);
        return;
      }
      if (method !== "DELETE" || id === editing) reset();
      if (showSaved) await refresh();
      setNotice(method === "DELETE" ? "Mark sheet deleted." : "Mark sheet saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to complete the request.");
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const createCertificate = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "certificate";
    void change(editing ? "PUT" : "POST", editing, {
      ...form, exam_course: editingCourse, ...Object.fromEntries(terminals.map(([field]) => [field, Number(form[field])])),
    }, createCertificate);
  }

  const preview = terminals.every(([field]) => form[field] !== "")
    ? examResult(terminals.map(([field]) => Number(form[field]))) : null;
  const matchingCertificates = certificates.filter(certificate => examCourseCode(certificate.course_name) === editingCourse && form.roll_no.trim() && form.batch_code.trim() &&
    normalize(certificate.roll_no) === normalize(form.roll_no) &&
    normalize(certificate.batch_number) === normalize(form.batch_code) &&
    normalize(certificate.student_name) === normalize(form.student_name));
  const visibleSheets = sheets.filter(sheet => certificateId
    ? sheet.certificate_ref === certificateId
    : normalize(`${sheet.student_name} ${sheet.registration_no}`).includes(normalize(search)));
  const sortedSheets = visibleSheets.sort((a, b) => {
    const first = a[sortField];
    const second = b[sortField];
    const comparison = typeof first === "number" && typeof second === "number"
      ? first - second : String(first).localeCompare(String(second), "en-IN", { numeric: true });
    return ascending ? comparison : -comparison;
  });
  const totalPages = Math.ceil(sortedSheets.length / pageSize);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const start = (currentPage - 1) * pageSize;

  function sortBy(field: SortField) {
    setAscending(field === sortField ? !ascending : true);
    setSortField(field);
    setPage(1);
  }

  const formContent = (
    <>
        <p>Passing requires at least 33 out of 100 in each required exam.</p>
        <form className={`grid gap-4 sm:grid-cols-2 ${!showSaved ? "text-white [&_input]:border-white/30 [&_input]:bg-white/20 [&_input]:text-white [&_input[type=date]]:[color-scheme:dark]" : ""}`} onSubmit={save}>
          <label className="sm:col-span-2">Course
            <Select value={editingCourse} disabled={Boolean(editing)} onValueChange={(code: keyof typeof examCourses) => {
              setEditingCourse(code);
              setForm(current => ({ ...current, first_terminal: "", second_terminal: "", third_terminal: "", certificate_ref: "" }));
            }}>
              <SelectTrigger aria-label="Course" className={showSaved ? "" : "border-white/30 bg-white/20 text-white"}><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(examCourses).map(([code, course]) => <SelectItem key={code} value={code}>{course.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label>Roll No.<Input required maxLength={46} pattern="[^/]+" value={form.roll_no} onChange={e => setForm({ ...form, roll_no: e.target.value, certificate_ref: "" })} /></label>
          <label>Batch Code<Input required maxLength={46} pattern="[^/]+" value={form.batch_code} onChange={e => setForm({ ...form, batch_code: e.target.value, certificate_ref: "" })} /></label>
          <label>Year<Input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} /></label>
          <label>Student name<Input required maxLength={150} value={form.student_name} onChange={e => setForm({ ...form, student_name: e.target.value, certificate_ref: "" })} /></label>
          <label className="sm:col-span-2">Father’s Name
            <Input maxLength={150} value={form.father_name} onChange={event => setForm({ ...form, father_name: event.target.value })} />
          </label>
          <p className="sm:col-span-2">Registration No. {form.roll_no || "Roll No."}/{form.batch_code || "Batch Code"}/{form.year || "Year"}</p>
          <label>Link to certificate
            <select className={`block w-full rounded-md border p-2 ${showSaved ? "bg-white" : "border-white/30 bg-white/20 text-white [&>option]:bg-slate-900"}`} value={form.certificate_ref} onChange={e => setForm({ ...form, certificate_ref: e.target.value })}>
              <option value="">No certificate linked</option>
              {matchingCertificates.map(certificate => <option key={certificate.id} value={certificate.id}>{certificate.certificate_id}</option>)}
            </select>
          </label>
          <label>Date of issue<Input required type="date" value={form.issued_on} onChange={e => setForm({ ...form, issued_on: e.target.value })} /></label>
          {terminals.map(([field, label, modules]) => (
            <label key={field}>{label} · Max 100 · Passing {passingMark}<Input required type="number" min={0} max={100} step={1} value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} /><small>{modules}</small></label>
          ))}
          {preview && <p className="sm:col-span-2">{preview.total}/{preview.maximum} · {preview.percentage}% · {preview.pass ? "Pass" : "Fail"} · Grade {preview.grade}</p>}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy} className={showSaved ? undefined : "bg-blue-600 text-white hover:bg-blue-700"}>{editing ? "Save changes" : "Create mark sheet"}</Button>
            {!certificateId && !form.certificate_ref && <Button type="submit" value="certificate" variant="outline" className={showSaved ? undefined : "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"} disabled={busy || !preview?.pass || matchingCertificates.length > 0}>Save &amp; Create Certificate</Button>}
            {editing && <Button type="button" variant="outline" onClick={reset}>Cancel edit</Button>}
          </div>
        </form>
    </>
  );

  if (!showSaved) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('/lovable-uploads/1c1f036d-97eb-4825-9766-e1ddb31b3f55.png')" }}>
        <div className="absolute inset-0 bg-black/40" />
        <nav className="relative border-b border-white/20 bg-white/10 shadow-sm backdrop-blur-lg">
          <div className="mx-auto grid min-h-16 max-w-7xl grid-cols-2 items-center gap-3 px-4 py-2 text-white sm:grid-cols-3 sm:px-6 lg:px-8">
            <Link className="flex w-fit items-center gap-2 hover:text-gray-200" to="/">
              <ArrowLeft className="h-5 w-5 shrink-0" aria-hidden="true" />
              Back To Home
            </Link>
            <h1 className="text-right text-xl font-semibold sm:text-center">Create Marksheet</h1>
          </div>
        </nav>
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Card className="border-white/20 bg-white/10 text-white backdrop-blur-lg">
            <CardHeader>
              <CardTitle>Create Marksheet</CardTitle>
              <CardDescription className="text-gray-200">Select a course and enter the student details and exam marks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {formContent}
              {notice && <p role="status">{notice}</p>}
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (previewOnly) {
    const sheet = visibleSheets[0];
    const score = sheet && marksheetResult(sheet);
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <Link className="text-white underline" to={`/print/${encodeURIComponent(certificateId)}`}>Back to Certificate</Link>
        <Card>
          <CardHeader><CardTitle>Marksheet Preview</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {loading ? <p role="status">Loading marksheet…</p> : loadError ? <p role="alert">{loadError}</p> : !sheet ? <p>No marksheet is linked to this certificate.</p> : (
              <>
                <div>
                  <h2 className="text-lg font-semibold">{sheet.student_name}</h2>
                  <p>Registration No. {sheet.registration_no}</p>
                  <p>{examCourses[sheet.exam_course].name}</p>
                  <p>Issue date {sheet.issued_on}</p>
                </div>
                <Table>
                  <TableHeader><TableRow><TableHead>Terminal</TableHead><TableHead>Course content</TableHead><TableHead>Marks</TableHead></TableRow></TableHeader>
                  <TableBody>{examCourses[sheet.exam_course].modules.map(([field, label, modules]) => (
                    <TableRow key={field}><TableCell>{label}</TableCell><TableCell>{modules}</TableCell><TableCell>{sheet[field]}/100</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
                <p className="font-medium">{score.total}/{score.maximum} · {score.percentage}% · {score.pass ? "Pass" : "Fail"} · Grade {score.grade}</p>
                <Button variant="outline" onClick={() => download(sheet)}><Download className="mr-2 h-4 w-4" />Download PDF</Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/lovable-uploads/1c1f036d-97eb-4825-9766-e1ddb31b3f55.png')" }}>
      <div className="absolute inset-0 bg-black/40" />
      <nav className="relative border-b border-white/20 bg-white/10 shadow-sm backdrop-blur-lg">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-white sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3 hover:text-gray-200" to="/"><ArrowLeft className="h-5 w-5" />Back to Home</Link>
          <h1 className="text-xl font-semibold">Manage Mark Sheets</h1>
          <Button asChild size="sm" className="bg-blue-600 text-white hover:bg-blue-700"><Link to="/marksheets">Create Mark Sheet</Link></Button>
        </div>
      </nav>

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Card className="border-white/20 bg-white/10 backdrop-blur-lg">
          <CardHeader>
            <CardTitle className="text-white">Saved Mark Sheets</CardTitle>
            <CardDescription className="text-gray-200">Find, edit and download marksheets.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" aria-hidden="true" />
              <Input type="search" aria-label="Search saved mark sheets" placeholder="Search by student name or registration number..." value={search}
                onChange={event => { setSearch(event.target.value); setPage(1); }}
                className="border-white/30 bg-white/20 pl-10 text-white placeholder:text-gray-300" />
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-gray-200">
              <span>Sort by</span>
              <Select value={sortField} onValueChange={(field: SortField) => { setSortField(field); setPage(1); }}>
                <SelectTrigger aria-label="Sort by" className="w-44 border-white/30 bg-white/20 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>{sortColumns.map(([field, label]) => <SelectItem value={field} key={field}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" onClick={() => { setAscending(!ascending); setPage(1); }} className={`bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 text-white`}>
                {ascending ? "Ascending" : "Descending"}<ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
              {sortedSheets.length > 0 && <span>Showing {start + 1}–{Math.min(start + pageSize, sortedSheets.length)} of {sortedSheets.length} marksheets</span>}
            </div>
            {notice && !editing && <p role="status" className="mb-4 text-white">{notice}</p>}
            {loading ? <p role="status" className="py-8 text-center text-gray-200">Loading marksheets…</p> : loadError ? (
              <p role="alert" className="py-8 text-center text-gray-200">{loadError}</p>
            ) : sortedSheets.length === 0 ? (
              <p className="py-8 text-center text-gray-200">{search ? "No marksheets match your search." : "No saved marksheets."}</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/20">
                      {sortColumns.map(([field, label]) => {
                        const Icon = sortField === field ? (ascending ? ArrowUp : ArrowDown) : ArrowUpDown;
                        return <TableHead key={field} className="whitespace-nowrap text-white" aria-sort={sortField === field ? (ascending ? "ascending" : "descending") : undefined}>
                          <Button size="sm" variant="ghost" className="h-auto gap-1 p-0 text-white hover:bg-white/20 hover:text-white" onClick={() => sortBy(field)}>{label}<Icon className="h-4 w-4" /></Button>
                        </TableHead>;
                      })}
                      <TableHead className="text-white">Result</TableHead><TableHead className="text-white">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{sortedSheets.slice(start, start + pageSize).map(sheet => {
                    const score = marksheetResult(sheet);
                    return <TableRow key={sheet.id} className="border-white/20 text-gray-200">
                      <TableCell className="font-medium text-white">{sheet.student_name}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{sheet.registration_no}</TableCell>
                      <TableCell className="whitespace-nowrap">{sheet.issued_on}</TableCell>
                      <TableCell>{sheet.first_terminal}/100</TableCell>
                      <TableCell>{sheet.exam_course === "cca" ? "–" : `${sheet.second_terminal}/100`}</TableCell>
                      <TableCell>{sheet.third_terminal == null ? "–" : `${sheet.third_terminal}/100`}</TableCell>
                      <TableCell className="whitespace-nowrap">{score.pass ? "Pass" : "Fail"} · {score.percentage}%</TableCell>
                      <TableCell><div className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap">
                        <Button size="sm" aria-label="Edit Marksheet" title="Edit Marksheet" onClick={() => edit(sheet)} disabled={busy} className={`bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 ${actionStyle}`}><Edit className="h-4 w-4" /></Button>
                        <Button size="sm" aria-label="Print Marksheet" title="Print Marksheet" className={`bg-emerald-700 hover:bg-emerald-800 ${actionStyle}`} onClick={() => {
                          if (!printMarkSheet(sheet)) setNotice("Allow pop-ups for this site to print the marksheet.");
                        }}><Printer className="h-4 w-4" /></Button>
                        <Button size="sm" aria-label="Download PDF" title="Download PDF" onClick={() => download(sheet)} className={`bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 ${actionStyle}`}><Download className="h-4 w-4" /></Button>
                        {sheet.certificate_ref ? <Button asChild size="sm" className={`bg-purple-700 hover:bg-purple-800 ${actionStyle}`}>
                          <Link to={`/print/${encodeURIComponent(sheet.certificate_ref)}`} aria-label="View Certificate" title="View Certificate"><FileBadge className="h-4 w-4" /></Link>
                        </Button> : score.pass && sheet.registration_no.split("/").length === 3 && <Button asChild size="sm" className={`bg-purple-700 hover:bg-purple-800 ${actionStyle}`}>
                          <Link to={`/generate?marksheet=${encodeURIComponent(sheet.id)}`} aria-label="Create Certificate" title="Create Certificate"><FilePlus className="h-4 w-4" /></Link>
                        </Button>}
                        {isAdmin() && <Button size="sm" disabled={busy} aria-label="Delete Marksheet" title="Delete Marksheet" className={`bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 ${actionStyle}`} onClick={() => {
                          if (window.confirm(`Delete the mark sheet for ${sheet.registration_no}?`)) void change("DELETE", sheet.id);
                        }}><Trash2 className="h-4 w-4" /></Button>}
                      </div></TableCell>
                    </TableRow>;
                  })}</TableBody>
                </Table>
                <CertificatePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !busy) reset(); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Marksheet</DialogTitle><DialogDescription>Update the saved marksheet details.</DialogDescription></DialogHeader>
          {formContent}
          {notice && <p role="status">{notice}</p>}
        </DialogContent>
      </Dialog>
    </main>
  );
}
