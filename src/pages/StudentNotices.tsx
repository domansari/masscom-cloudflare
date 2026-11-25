import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

type Student = {
  id: string;
  student_name: string;
  roll_no: string | null;
  batch_code: string | null;
  phone: string;
  consent_at: string | null;
};

const dateLabel = (date: string) => new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium", timeZone: "UTC",
}).format(new Date(date + "T00:00:00Z"));

const field = "w-full rounded-md border border-white/20 bg-slate-900 px-3 py-2 text-white";
const panel = "space-y-4 rounded-xl border border-white/20 bg-slate-950/70 p-5";

async function readResponse(response: Response) {
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || "Student Notices request failed.");
  return result;
}

function Notices() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [resume, setResume] = useState("");
  const [details, setDetails] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/student-notices", { signal: controller.signal })
      .then(readResponse)
      .then(result => setStudents(result.data))
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const batches = [...new Set(students.map(student => student.batch_code).filter(Boolean) as string[])].sort();
  const recipients = students.filter(student => !selectedBatches.length || selectedBatches.includes(student.batch_code || ""));
  const eligible = new Set(recipients.filter(student => student.consent_at).map(student => student.phone));
  const callList = recipients.filter(student => !student.consent_at);
  const vacationReady = start && end && resume && start <= end && resume > end;
  const preview = vacationReady && ("Masscom Infotech Education\nVacation Notice\nClasses will be closed from " + dateLabel(start) + " to " + dateLabel(end) +
      ". Classes resume on " + dateLabel(resume) + "." + (details.trim() ? "\n" + details.trim() : ""));

  async function recordConsent(student: Student) {
    const granted = !student.consent_at;
    const prompt = granted
      ? "Confirm the owner of +" + student.phone + " agreed to receive Masscom vacation, class changes and urgent notices on WhatsApp."
      : "Remove WhatsApp notice consent for " + student.student_name + "?";
    if (!window.confirm(prompt)) return;
    setSaving(true);
    setError("");
    try {
      const result = await readResponse(await fetch("/api/student-notices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: student.id, phone: student.phone, granted }),
      }));
      setStudents(current => current.map(row => row.id === student.id ? { ...row, consent_at: result.consent_at } : row));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update consent.");
    } finally {
      setSaving(false);
    }
  }

  async function copyNotice() {
    if (!preview) return;
    setCopied(false);
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
    } catch {
      setError("Could not copy the notice. Select and copy the preview text.");
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-white">
      <header>
        <Link to="/" className="text-sm text-cyan-200 underline">Back to Dashboard</Link>
        <h1 className="mt-2 text-3xl font-bold">Student Notices</h1>
        <p className="mt-1 text-slate-300">Prepare vacation notices. Bulk WhatsApp sending awaits template approval.</p>
      </header>
      {error && <p role="alert" className="rounded-md bg-rose-950 p-3 text-rose-100">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={panel}>
          <h2 className="text-xl font-semibold">Compose notice</h2>
          <label className="block space-y-1">First day of vacation
            <input className={field} type="date" value={start} onChange={event => { setStart(event.target.value); setCopied(false); }} />
          </label>
          <label className="block space-y-1">Last day of vacation
            <input className={field} type="date" min={start || undefined} value={end} onChange={event => { setEnd(event.target.value); setCopied(false); }} />
          </label>
          <label className="block space-y-1">Classes resume
            <input className={field} type="date" min={end || undefined} value={resume} onChange={event => { setResume(event.target.value); setCopied(false); }} />
          </label>
          <label className="block space-y-1">Additional details (optional)
            <textarea className={field} rows={4} maxLength={600} value={details} onChange={event => { setDetails(event.target.value); setCopied(false); }} />
          </label>
          {start && end && resume && !vacationReady &&
            <p className="text-amber-200">The last day must be on or after the first day. Classes must resume after the last day.</p>}
        </section>
        <section className={panel}>
          <h2 className="text-xl font-semibold">Preview</h2>
          <p className="whitespace-pre-wrap break-words rounded-md bg-slate-900 p-4">{preview || "Complete the notice fields to see the message."}</p>
          <Button disabled={!preview} onClick={() => void copyNotice()}>{copied ? "Copied" : "Copy notice"}</Button>
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium">Recipients</legend>
            <Button size="sm" variant="secondary" onClick={() => setSelectedBatches([])}>All active students</Button>
            <p className="text-sm text-slate-300">{selectedBatches.length ? "Selected batches" : "All active students selected"}</p>
            <div className="flex max-h-40 flex-wrap gap-3 overflow-auto">
              {batches.map(batch => <label key={batch} className="flex items-center gap-2">
                <input type="checkbox" checked={selectedBatches.includes(batch)} onChange={event => {
                  const checked = event.target.checked;
                  setSelectedBatches(current => checked ? [...current, batch] : current.filter(item => item !== batch));
                }} />
                {batch}
              </label>)}
            </div>
          </fieldset>
          <p className="text-sm text-slate-300">{loading ? "Loading students…" :
            recipients.length + " students · " + eligible.size + " unique WhatsApp numbers with consent · " + callList.length + " students to contact separately"}</p>
        </section>
      </div>
      <section className={panel}>
        <h2 className="text-xl font-semibold">Contact list and consent</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-300"><tr>
              <th className="p-2">Student</th><th className="p-2">Batch</th><th className="p-2">Contact</th><th className="p-2">WhatsApp consent</th>
            </tr></thead>
            <tbody>{recipients.map(student => <tr key={student.id} className="border-t border-white/10">
              <td className="p-2">{student.student_name}{student.roll_no && <span className="block text-slate-400">{student.roll_no}</span>}</td>
              <td className="p-2">{student.batch_code || "Unassigned"}</td>
              <td className="p-2">{student.phone ? <a className="text-cyan-200 underline" href={"tel:+" + student.phone}>+{student.phone}</a> : "No valid number"}</td>
              <td className="p-2">
                <p className="mb-1">{student.consent_at ? "Recorded " + dateLabel(student.consent_at.slice(0, 10)) : "Contact separately"}</p>
                {student.phone && <Button size="sm" variant="secondary" disabled={saving} onClick={() => void recordConsent(student)}>
                  {student.consent_at ? "Revoke consent" : "Record consent"}
                </Button>}
              </td>
            </tr>)}</tbody>
          </table>
          {!loading && !recipients.length && <p className="p-2 text-slate-300">No active students found.</p>}
        </div>
      </section>
    </main>
  );
}

export default function StudentNotices() {
  const { isAdmin } = useAuth();
  return isAdmin() ? <Notices /> : <Navigate to="/" replace />;
}
