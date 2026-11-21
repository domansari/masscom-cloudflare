import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

const terminals = [
  ["first_terminal", "1st Terminal", "Computer Fundamentals, MS-DOS, MS-Windows 7"],
  ["second_terminal", "2nd Terminal", "MS Word, MS Excel, MS Access, MS PowerPoint, Internet"],
] as const;
type Sheet = { id: string; registration_no: string; student_name: string; issued_on: string; first_terminal: number; second_terminal: number };
const emptyForm = { registration_no: "", student_name: "", issued_on: "", first_terminal: "", second_terminal: "" };

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

export default function MarkSheets() {
  const { isAdmin } = useAuth();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function refresh() {
    setSheets((await request()).data);
  }

  useEffect(() => {
    refresh().catch((error: Error) => setNotice(error.message));
  }, []);

  function edit(sheet: Sheet) {
    setEditing(sheet.id);
    setForm({ ...sheet, first_terminal: String(sheet.first_terminal), second_terminal: String(sheet.second_terminal) });
  }

  function reset() {
    setEditing(undefined);
    setForm(emptyForm);
  }

  async function change(method: string, id?: string, values?: object) {
    setBusy(true);
    try {
      await request(method, id, values);
      if (method !== "DELETE" || id === editing) reset();
      await refresh();
      setNotice(method === "DELETE" ? "Mark sheet deleted." : "Mark sheet saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to complete the request.");
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void change(editing ? "PUT" : "POST", editing, {
      ...form, first_terminal: Number(form.first_terminal), second_terminal: Number(form.second_terminal),
    });
  }

  const preview = form.first_terminal !== "" && form.second_terminal !== ""
    ? result(Number(form.first_terminal), Number(form.second_terminal)) : null;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <Link className="text-white underline" to="/">Certificate portal</Link>
      <section className="space-y-4 rounded-lg bg-white p-5">
        <h1 className="text-2xl font-bold">DCA Mark Sheets</h1>
        <p>Passing requires at least 33 out of 100 in each terminal.</p>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
          <label>Registration No.<Input required maxLength={100} value={form.registration_no} onChange={e => setForm({ ...form, registration_no: e.target.value })} /></label>
          <label>Student name<Input required maxLength={150} value={form.student_name} onChange={e => setForm({ ...form, student_name: e.target.value })} /></label>
          <label>Date of issue<Input required type="date" value={form.issued_on} onChange={e => setForm({ ...form, issued_on: e.target.value })} /></label>
          {terminals.map(([field, label, modules]) => (
            <label key={field}>{label} (out of 100)<Input required type="number" min={0} max={100} step={1} value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} /><small>{modules}</small></label>
          ))}
          {preview && <p className="sm:col-span-2">{preview.total}/200 · {preview.percentage}% · {preview.pass ? "Pass" : "Fail"} · Grade {preview.grade}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>{editing ? "Save changes" : "Create mark sheet"}</Button>
            {editing && <Button type="button" variant="outline" onClick={reset}>Cancel edit</Button>}
          </div>
        </form>
        <p role="status">{notice}</p>
      </section>
      <section className="space-y-4 rounded-lg bg-white p-5">
        <h2 className="text-xl font-semibold">Saved mark sheets</h2>
        {sheets.length === 0 && <p>No mark sheets to display.</p>}
        {sheets.map(sheet => {
          const score = result(sheet.first_terminal, sheet.second_terminal);
          return <article key={sheet.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div><strong>{sheet.student_name}</strong><p>{sheet.registration_no} · {score.total}/200 · {score.percentage}% · {score.pass ? "Pass" : "Fail"}</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => edit(sheet)} disabled={busy}>Edit</Button>
              <Button variant="outline" onClick={() => download(sheet)}>Download PDF</Button>
              {isAdmin() && <Button variant="destructive" disabled={busy} onClick={() => {
                if (window.confirm(`Delete the mark sheet for ${sheet.registration_no}?`)) void change("DELETE", sheet.id);
              }}>Delete</Button>}
            </div>
          </article>;
        })}
      </section>
    </main>
  );
}
