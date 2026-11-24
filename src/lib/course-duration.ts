const durationByCourse = new Map<string, number>([
  ["diploma in computer application", 8],
  ["advance diploma in computer application", 12],
  ["certificate course in computer accountancy", 4],
  ["advance diploma in computer accountancy", 12],
  ["certificate course in desktop publishing", 4],
  ["advance diploma in desktop publishing", 12],
  ["diploma in dtp", 4],
]);

export function courseDurationMonths(courseName?: string | null): number | null {
  return durationByCourse.get(String(courseName || "").trim().toLowerCase()) ?? null;
}
