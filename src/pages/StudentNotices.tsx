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
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [resume, setResume] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState("");
  const [failedMessages, setFailedMessages] = useState<string[]>([]);

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
  const sendable = recipients.filter(student => student.phone);
  const uniqueRecipients = [...new Map(sendable.map(student => [student.phone, student])).values()];
  const withoutPhone = recipients.filter(student => !student.phone).length;
  const vacationReady = Boolean(start && end && resume && start <= end && end < resume);
  const preview = vacationReady && ("Masscom Infotech Education: Your classes will be closed from " + dateLabel(start) + " to " + dateLabel(end) +
      ". Classes will resume on " + dateLabel(resume) + " Thank You.");

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
  async function sendVacationNotice() {
    if (!vacationReady || !uniqueRecipients.length || sending) return;
    const confirmed = window.confirm(
      "Send the approved vacation notice to " + uniqueRecipients.length + " unique WhatsApp numbers? Only active students with a valid phone number will receive it."
    );
    if (!confirmed) return;

    setSending(true);
    setError("");
    setSendStatus("Starting…");
    setFailedMessages([]);
    let accepted = 0;
    let processed = 0;
    const failures: string[] = [];
    try {
      for (const student of uniqueRecipients) {
        let fatal = false;
        try {
          const response = await fetch("/api/student-notice-send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ student_id: student.id, start, end, resume }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || result.success !== true) {
            const message = result.error || "Meta did not confirm acceptance.";
            failures.push(student.student_name + ": " + message);
            fatal = result.fatal === true;
            if (fatal) setError(message);
          } else {
            accepted += 1;
          }
        } catch (cause) {
          failures.push(student.student_name + ": " + (cause instanceof Error ? cause.message : "Network error."));
        }
        processed += 1;
        setSendStatus("Processed " + processed + " of " + uniqueRecipients.length + " · " + accepted + " accepted by Meta · " + failures.length + " failed");
        if (fatal) break;
        if (processed < uniqueRecipients.length) await new Promise(resolve => window.setTimeout(resolve, 250));
      }
      setFailedMessages(failures);
      setSendStatus((processed < uniqueRecipients.length ? "Stopped after a template or account error. " : "Finished. ") + accepted + " accepted by Meta; " + failures.length + " failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-white">
      <header>
        <Link to="/" className="text-sm text-cyan-200 underline">Back to Dashboard</Link>
        <h1 className="mt-2 text-3xl font-bold">Student Notices</h1>
        <p className="mt-1 text-slate-300">Send the approved masscom_vacation_notice template to active students with saved WhatsApp numbers. Duplicate numbers receive one message.</p>
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
          <p className="text-sm text-slate-300">This approved template includes the three dates only; extra message text cannot be added to it.</p>
          {start && end && resume && !vacationReady &&
            <p className="text-amber-200">The last day must be on or after the first day. Classes must resume after the last day.</p>}
        </section>
        <section className={panel}>
          <h2 className="text-xl font-semibold">Preview</h2>
          <p className="whitespace-pre-wrap break-words rounded-md bg-slate-900 p-4">{preview || "Complete the notice fields to see the message."}</p>
          <Button disabled={!preview || sending} onClick={() => void copyNotice()}>{copied ? "Copied" : "Copy notice"}</Button>
          <Button type="button" disabled={!vacationReady || !uniqueRecipients.length || sending || loading} onClick={() => void sendVacationNotice()}>
            {sending ? "Sending…" : "Send to " + uniqueRecipients.length + " WhatsApp numbers"}
          </Button>
          {sendStatus && <p role="status" className="text-sm text-slate-200">{sendStatus}</p>}
          {!!failedMessages.length && <div role="alert" className="max-h-48 overflow-auto rounded-md bg-rose-950/70 p-3 text-sm text-rose-100">
            <p className="mb-1 font-semibold">Messages not accepted</p>
            <ul className="list-disc space-y-1 pl-5">{failedMessages.map((message, index) => <li key={index}>{message}</li>)}</ul>
          </div>}
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
            recipients.length + " active students · " + uniqueRecipients.length + " unique WhatsApp numbers ready · " + withoutPhone + " without a valid phone"}</p>
        </section>
      </div>
      <section className={panel}>
        <h2 className="text-xl font-semibold">Student contact list</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-300"><tr>
              <th className="p-2">Student</th><th className="p-2">Batch</th><th className="p-2">WhatsApp number</th>
            </tr></thead>
            <tbody>{recipients.map(student => <tr key={student.id} className="border-t border-white/10">
              <td className="p-2">{student.student_name}{student.roll_no && <span className="block text-slate-400">{student.roll_no}</span>}</td>
              <td className="p-2">{student.batch_code || "Unassigned"}</td>
              <td className="p-2">{student.phone ? <a className="text-cyan-200 underline" href={"tel:+" + student.phone}>+{student.phone}</a> : "No valid number"}</td>
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
