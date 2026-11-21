import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

const terminals = [
  ["first_terminal", "1st Terminal", "Computer Fundamentals, MS-DOS, MS-Windows 7"],
  ["second_terminal", "2nd Terminal", "MS Word, MS Excel, MS Access, MS PowerPoint, Internet"],
] as const;
type Sheet = { id: string; registration_no: string; student_name: string; issued_on: string; first_terminal: number; second_terminal: number; certificate_ref: string | null };
type Certificate = { id: string; certificate_id: string; student_name: string; roll_no?: string; batch_number?: string; course_name: string };
const emptyForm = { roll_no: "", batch_code: "", year: "", certificate_ref: "", student_name: "", issued_on: "", first_terminal: "", second_terminal: "" };
const normalize = (value?: string) => (value ?? "").trim().toLowerCase();

function result(first: number, second: number) {
  const total = first + second;
  const pass = first >= 33 && second >= 33;
  return { total, percentage: (total / 2).toFixed(2), pass, grade: !pass ? "Fail" : total > 150 ? "Excellent" : total > 100 ? "Good" : "Satisfactory" };
}

function download(sheet: Sheet) {
  const pdf = new jsPDF({ unit: "mm", format: "letter" });
  const score = result(sheet.first_terminal, sheet.second_terminal);
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
    "Course  Diploma in Computer Application",
    "Duration  8 months",
  ];
  pdf.text(lines, 23, 57);
  let y = 62 + lines.length * 5;
  pdf.text("Course / Subject / Module", 23, y);
  pdf.text("Maximum", 148, y);
  pdf.text("Secured", 178, y);
  for (const [key, label, modules] of terminals) {
    pdf.line(23, y + 3, 193, y + 3);
    y += 12;
    pdf.text(label, 23, y);
    pdf.text("100", 154, y);
    pdf.text(String(sheet[key]), 182, y);
    pdf.text(pdf.splitTextToSize(modules, 112), 23, y + 6);
    y += 18;
  }
  pdf.text(`Total: ${score.total}/200    Percentage: ${score.percentage}%    Grade: ${score.grade}`, 23, y + 7);
  pdf.text("Passing requirement: at least 33/100 in each terminal.", 23, y + 17);
  pdf.text("Prepared By", 23, 245);
  pdf.text(`Date of Issue: ${sheet.issued_on}`, 79, 245);
  pdf.text("Controller of Examination", 146, 245);
  pdf.save(`DCA-${sheet.registration_no.replace(/[^a-z0-9_-]/gi, "-")}.pdf`);
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
  const [loading, setLoading] = useState(true);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function refresh() {
    setSheets((await request()).data);
  }

  useEffect(() => {
    if (!showSaved) return;
    refresh().catch((error: Error) => setNotice(error.message)).finally(() => setLoading(false));
  }, [showSaved]);

  useEffect(() => {
    let active = true;
    fetch("/api/certificates").then(async response => {
      if (!response.ok) throw new Error("Could not load certificates for linking.");
      const { data } = await response.json() as { data: Certificate[] };
      if (!active) return;
      const dca = data.filter(certificate => ["dca", "diploma in computer application", "diploma in computer applications"].includes(normalize(certificate.course_name)));
      setCertificates(dca);
      const selected = dca.find(certificate => certificate.id === certificateId);
      if (selected?.roll_no && selected.batch_number) {
        setForm({ ...emptyForm, roll_no: selected.roll_no, batch_code: selected.batch_number, student_name: selected.student_name, certificate_ref: selected.id });
      }
    }).catch((error: Error) => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [certificateId]);

  function edit(sheet: Sheet) {
    const [roll_no = "", batch_code = "", year = ""] = sheet.registration_no.split("/");
    setEditing(sheet.id);
    setForm({
      ...emptyForm, roll_no, batch_code, year, certificate_ref: sheet.certificate_ref ?? "",
      student_name: sheet.student_name, issued_on: sheet.issued_on,
      first_terminal: String(sheet.first_terminal), second_terminal: String(sheet.second_terminal),
    });
  }

  function reset() {
    setEditing(undefined);
    const selected = certificates.find(certificate => certificate.id === certificateId);
    setForm(selected?.roll_no && selected.batch_number
      ? { ...emptyForm, roll_no: selected.roll_no, batch_code: selected.batch_number, student_name: selected.student_name, certificate_ref: selected.id }
      : emptyForm);
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
    if (certificateId && form.certificate_ref !== certificateId) {
      setNotice("Select this certificate before saving its mark sheet.");
      return;
    }
    const createCertificate = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "certificate";
    void change(editing ? "PUT" : "POST", editing, {
      ...form, first_terminal: Number(form.first_terminal), second_terminal: Number(form.second_terminal),
    }, createCertificate);
  }

  const preview = form.first_terminal !== "" && form.second_terminal !== ""
    ? result(Number(form.first_terminal), Number(form.second_terminal)) : null;
  const matchingCertificates = certificates.filter(certificate => form.roll_no.trim() && form.batch_code.trim() &&
    normalize(certificate.roll_no) === normalize(form.roll_no) &&
    normalize(certificate.batch_number) === normalize(form.batch_code) &&
    normalize(certificate.student_name) === normalize(form.student_name));
  const visibleSheets = sheets.filter(sheet => certificateId
    ? sheet.certificate_ref === certificateId
    : normalize(`${sheet.student_name} ${sheet.registration_no}`).includes(normalize(search)));
  const showForm = !showSaved || Boolean(editing) || Boolean(certificateId && !loading && visibleSheets.length === 0);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="-order-2 flex flex-wrap gap-4 text-white">
        <Link className="underline" to="/">Certificate portal</Link>
        <Link className="underline" to={showSaved ? "/marksheets" : "/marksheets/manage"}>{showSaved ? "Create Mark Sheet" : "Manage Mark Sheets"}</Link>
      </div>
      {showForm && <section id="marksheet-form" className="space-y-4 rounded-lg bg-white p-5">
        <h1 className="text-2xl font-bold">{editing ? "Edit DCA Mark Sheet" : "Create DCA Mark Sheet"}</h1>
        <p>Passing requires at least 33 out of 100 in each terminal.</p>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
          <label>Roll No.<Input required maxLength={46} pattern="[^/]+" value={form.roll_no} onChange={e => setForm({ ...form, roll_no: e.target.value, certificate_ref: "" })} /></label>
          <label>Batch Code<Input required maxLength={46} pattern="[^/]+" value={form.batch_code} onChange={e => setForm({ ...form, batch_code: e.target.value, certificate_ref: "" })} /></label>
          <label>Year<Input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} /></label>
          <label>Student name<Input required maxLength={150} value={form.student_name} onChange={e => setForm({ ...form, student_name: e.target.value, certificate_ref: "" })} /></label>
          <p className="sm:col-span-2">Registration No. {form.roll_no || "Roll No."}/{form.batch_code || "Batch Code"}/{form.year || "Year"}</p>
          {certificateId && matchingCertificates.length === 0 && <p className="sm:col-span-2">The certificate must have a matching roll number, batch code, and student name before it can be linked.</p>}
          <label>Link to certificate
            <select className="block w-full rounded-md border bg-white p-2" value={form.certificate_ref} onChange={e => setForm({ ...form, certificate_ref: e.target.value })}>
              <option value="">No certificate linked</option>
              {matchingCertificates.map(certificate => <option key={certificate.id} value={certificate.id}>{certificate.certificate_id}</option>)}
            </select>
          </label>
          <label>Date of issue<Input required type="date" value={form.issued_on} onChange={e => setForm({ ...form, issued_on: e.target.value })} /></label>
          {terminals.map(([field, label, modules]) => (
            <label key={field}>{label} (out of 100)<Input required type="number" min={0} max={100} step={1} value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} /><small>{modules}</small></label>
          ))}
          {preview && <p className="sm:col-span-2">{preview.total}/200 · {preview.percentage}% · {preview.pass ? "Pass" : "Fail"} · Grade {preview.grade}</p>}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy}>{editing ? "Save changes" : "Create mark sheet"}</Button>
            {!certificateId && !form.certificate_ref && <Button type="submit" value="certificate" variant="outline" disabled={busy || !preview?.pass || matchingCertificates.length > 0}>Save &amp; Create Certificate</Button>}
            {editing && <Button type="button" variant="outline" onClick={reset}>Cancel edit</Button>}
          </div>
        </form>
      </section>}
      {notice && <p className="rounded-lg bg-white p-3" role="status">{notice}</p>}
      {showSaved && <section id="saved-mark-sheets" className={`space-y-4 rounded-lg bg-white p-5 ${certificateId ? "-order-1" : ""}`}>
        <h1 className="text-2xl font-bold">Saved Mark Sheets</h1>
        {certificateId ? <Link className="underline" to="/marksheets/manage">Show all mark sheets</Link> : (
          <label className="block max-w-md">Search saved mark sheets
            <Input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Student name or registration number" />
          </label>
        )}
        {loading ? <p role="status">Loading mark sheets…</p> : visibleSheets.length === 0 && <p>No mark sheets to display.</p>}
        {visibleSheets.map(sheet => {
          const score = result(sheet.first_terminal, sheet.second_terminal);
          return <article key={sheet.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div><strong>{sheet.student_name}</strong><p>{sheet.registration_no} · {score.total}/200 · {score.percentage}% · {score.pass ? "Pass" : "Fail"}</p>
              <p className="text-sm">1st Terminal {sheet.first_terminal}/100 · 2nd Terminal {sheet.second_terminal}/100</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {sheet.certificate_ref && <Button asChild variant="outline"><Link to={`/print/${encodeURIComponent(sheet.certificate_ref)}`}>View certificate</Link></Button>}
              {!sheet.certificate_ref && score.pass && sheet.registration_no.split("/").length === 3 && <Button asChild variant="outline"><Link to={`/generate?marksheet=${encodeURIComponent(sheet.id)}`}>Create Certificate</Link></Button>}
              <Button variant="outline" onClick={() => {
                edit(sheet);
                requestAnimationFrame(() => document.getElementById("marksheet-form")?.scrollIntoView());
              }} disabled={busy}>Edit</Button>
              <Button variant="outline" onClick={() => download(sheet)}>Download PDF</Button>
              {isAdmin() && <Button variant="destructive" disabled={busy} onClick={() => {
                if (window.confirm(`Delete the mark sheet for ${sheet.registration_no}?`)) void change("DELETE", sheet.id);
              }}>Delete</Button>}
            </div>
          </article>;
        })}
      </section>}
    </main>
  );
}
