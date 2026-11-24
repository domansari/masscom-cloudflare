import { useRef, useState, type ChangeEvent } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { backupColumns, formatBackupValue, workbookTitle, type BackupRow, type BackupType } from "@/lib/backup-columns";
import { examCourses, validExamMarks, validMarksheetEntries } from "../../functions/api/_exam-courses.js";

type ImportRow = { number: number; data: BackupRow };
type ImportReview = { rows: ImportRow[]; errors: string[] };
const fileLimit = 5 * 1024 * 1024;
const rowLimit = 1000;

async function getRecords(type: BackupType) {
  const response = await fetch(`/api/${type}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load records for export.");
  return (await response.json()).data;
}

export default function ExcelBackup({ type, onImported }: { type: BackupType; onImported?: () => Promise<unknown> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [review, setReview] = useState<ImportReview | null>(null);
  const columns = backupColumns[type];
  const title = workbookTitle[type];

  async function download(template: boolean) {
    setBusy(true);
    setStatus("");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(title, { views: [{ state: "frozen", ySplit: 1 }] });
      worksheet.columns = columns.map(column => ({
        header: column.label, key: column.key, width: Math.max(16, column.label.length + 5),
        style: { numFmt: column.number ? "0" : "@" },
      }));
      const header = worksheet.getRow(1);
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF20375A" } };
      if (!template) {
        const records = await getRecords(type);
        if (type === "certificates") worksheet.addRows(records);
        else {
          const certificates = await getRecords("certificates");
          const links = new Map(certificates.map(certificate => [certificate.id, certificate.certificate_id]));
          worksheet.addRows(records.map(sheet => {
            const [roll_no, batch_code, year] = sheet.registration_no.split("/");
            const examMarks = Object.fromEntries(examCourses[sheet.exam_course].modules.map(([field]) => [
              field, sheet[field] ?? "Not Declared",
            ]));
            return { ...sheet, roll_no, batch_code, year,
              second_terminal: ["cca", "cdtp"].includes(sheet.exam_course) ? null : sheet.second_terminal,
              ...examMarks, linked_certificate_id: links.get(sheet.certificate_ref) ?? "" };
          }));
        }
      }
      const instructions = workbook.addWorksheet("Instructions");
      instructions.getColumn(1).width = 100;
      instructions.addRows([
        ["Use the first sheet and keep its column headings."],
        ["Use YYYY-MM-DD for dates and enter identifiers as text."],
        ["Existing records are never overwritten. Rows with errors are reported separately."],
        ...(type === "marksheets" ? [
          ["Course codes: dca, cca, adca, cdtp, adtp."],
          ["For new marksheets, fill roll number, batch code and year. Keep Saved Enrollment No. on restored backup rows."],
          ["Enter exam 1 only for cca or cdtp, exams 1–2 for dca, and exams 1–3 for adca or adtp."],
          ["For a pending exam enter Not Declared. Leave Issue Date blank until all marks are available."],
          ["To link a marksheet, enter the Certificate ID of an existing certificate."],
        ] : [["This workbook is an export of certificate records."]]),
      ]);
      instructions.getColumn(1).alignment = { wrapText: true };
      const bytes = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = template ? `${type}-template.xlsx` : `${type}-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(template ? "Blank template downloaded." : "Excel backup downloaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create the workbook.");
    } finally {
      setBusy(false);
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatus("");
    setBusy(true);
    try {
      if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > fileLimit) {
        throw new Error("Choose an .xlsx file up to 5 MB.");
      }
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.getWorksheet(title);
      if (!worksheet || !columns.every((column, index) => worksheet.getRow(1).getCell(index + 1).text === column.label)) {
        throw new Error(`Use the ${title} template and keep its column headings and order.`);
      }
      const rows: ImportRow[] = [];
      const errors: string[] = [];
      worksheet.eachRow((row, number) => {
        if (number === 1) return;
        if (rows.length + errors.length >= rowLimit) throw new Error("Import up to 1,000 rows per workbook.");
        try {
          const data: BackupRow = {};
          for (const [index, column] of columns.entries()) {
            const value = formatBackupValue(row.getCell(index + 1).value, column);
            if (value !== undefined) data[column.key] = value;
          }
          if (!Object.keys(data).length) return;
          const missing = columns.find(column => column.required && data[column.key] === undefined);
          if (missing) throw new Error(`${missing.label} is required.`);
          if (type === "marksheets") {
            if ((!data.registration_no && (!data.roll_no || !data.batch_code || !/^\d{4}$/.test(String(data.year)))) || !validMarksheetEntries(data.exam_course, data)) {
              throw new Error("Enter the Enrollment No. details, a valid course code and marks or Not Declared for each required exam.");
            }
            if (Boolean(data.issued_on) !== validExamMarks(data.exam_course, data)) {
              throw new Error("Enter an issue date only when all exam marks are declared.");
            }
          }
          rows.push({ number, data });
        } catch (error) {
          errors.push(`Row ${number}: ${error instanceof Error ? error.message : "Invalid row."}`);
        }
      });
      if (!rows.length && !errors.length) throw new Error("The workbook has no records.");
      setReview({ rows, errors });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open the workbook.");
    } finally {
      setBusy(false);
    }
  }

  async function importRows() {
    if (!review || busy) return;
    setBusy(true);
    let imported = 0;
    const errors = [...review.errors];
    try {
      for (const row of review.rows) {
        try {
          const response = await fetch("/api/backup-import", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ row: row.data }),
          });
          if (response.status === 401 || response.status === 403) {
            errors.push(`Row ${row.number}: admin access is required. Import stopped.`);
            break;
          }
          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            errors.push(`Row ${row.number}: ${result.error || "Could not import this row."}`);
          } else imported++;
        } catch {
          errors.push(`Row ${row.number}: connection lost. Import stopped. Check the list before retrying.`);
          break;
        }
      }
      if (imported) await onImported?.().catch(() => {});
      setStatus(`Imported ${imported} of ${review.rows.length + review.errors.length} rows.`);
      setReview(errors.length ? { rows: [], errors } : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void download(false)}><Download className="mr-2 h-4 w-4" />Export Excel Backup</Button>
        {type === "marksheets" && <>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void download(true)}><FileSpreadsheet className="mr-2 h-4 w-4" />Download Blank Template</Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}><Upload className="mr-2 h-4 w-4" />Import Excel</Button>
        <input ref={input} type="file" accept=".xlsx" className="sr-only" tabIndex={-1} aria-label="Import Excel workbook" onChange={readFile} />
        </>}
      </div>
      {status && <p role="status" className="text-sm text-white">{status}</p>}
      <Dialog open={!!review} onOpenChange={open => { if (!open && !busy) setReview(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{review?.rows.length ? "Review Excel import" : "Excel import report"}</DialogTitle>
            <DialogDescription>{review?.rows.length ? `${review.rows.length} rows ready for import. Existing records are kept.` : status || "Check the rows below."}</DialogDescription>
          </DialogHeader>
          {!!review?.errors.length && <ul className="max-h-64 list-disc space-y-1 overflow-y-auto pl-5 text-sm">{review.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setReview(null)}>{review?.rows.length ? "Cancel" : "Close"}</Button>
            {!!review?.rows.length && <Button disabled={busy} onClick={() => void importRows()}>{busy ? "Importing…" : "Import rows"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
