export function formatIndianDate(value: string | number | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return "—";
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(value);
  }
  const text = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (parsed.getUTCFullYear() === Number(year) && parsed.getUTCMonth() === Number(month) - 1 && parsed.getUTCDate() === Number(day)) return `${day}/${month}/${year}`;
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(parsed)
    : text;
}

export function formatSessionYear(value: string | null | undefined): string {
  const year = /^(\d{4})/.exec(String(value || "").trim());
  return year?.[1] || "—";
}
