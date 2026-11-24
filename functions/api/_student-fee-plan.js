const COURSE_DURATIONS = new Map([
  ["diploma in computer application", 8],
  ["advance diploma in computer application", 12],
  ["certificate course in computer accountancy", 4],
  ["advance diploma in computer accountancy", 12],
  ["certificate course in desktop publishing", 4],
  ["advance diploma in desktop publishing", 12],
  ["diploma in dtp", 4],
]);

export function courseDurationMonths(courseName) {
  return COURSE_DURATIONS.get(String(courseName || "").trim().toLowerCase()) || null;
}

function firstOfNextMonth(isoDate, offset = 0) {
  const [year, month] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month + offset, 1)).toISOString().slice(0, 10);
}

function periodForDate(isoDate) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(isoDate + "T00:00:00.000Z"));
}

function indiaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = type => parts.find(part => part.type === type)?.value || "";
  return value("year") + "-" + value("month") + "-" + value("day");
}

function makeItem(studentId, category, amount, dueDate, period, waived = false, label = "") {
  return {
    id: crypto.randomUUID(), student_id: studentId, fee_category: category, amount,
    due_date: dueDate, period: period || "", is_waived: waived ? 1 : 0,
    is_active: 1, description: label || null,
  };
}

export function buildBaseFeePlan(student) {
  const items = [];
  const duration = Number(student.course_duration_months || courseDurationMonths(student.course_name) || 0);
  const admissionDate = String(student.admission_date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(admissionDate) || !duration || duration > 120) return items;

  const admissionFee = Number(student.one_time_fee || 0);
  if (admissionFee > 0) items.push(makeItem(student.id, "Admission Fee", admissionFee, admissionDate, "", false, "Admission Fee"));

  const monthlyFee = Number(student.monthly_fee || 0);
  if (monthlyFee > 0) {
    const waiveLastTwo = Number(student.waive_last_two_months) === 1;
    for (let index = 0; index < duration; index++) {
      const dueDate = firstOfNextMonth(admissionDate, index);
      const waived = waiveLastTwo && index >= duration - 2;
      items.push(makeItem(student.id, "Monthly Fee", monthlyFee, dueDate, periodForDate(dueDate), waived, "Monthly Fee"));
    }
  }
  return items;
}

export async function feePlanStatements(env, items, createdBy = null) {
  return items.map(item => env.DB.prepare(
    `INSERT OR IGNORE INTO student_fee_plan_items
     (id, student_id, fee_category, amount, due_date, period, is_waived, is_active, description, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(item.id, item.student_id, item.fee_category, item.amount, item.due_date, item.period,
    item.is_waived, item.is_active, item.description, createdBy));
}

export async function ensureStudentFeePlan(env, student, createdBy = null) {
  if (!student?.id) return;
  const existing = await env.DB.prepare(
    "SELECT id FROM student_fee_plan_items WHERE student_id = ? LIMIT 1"
  ).bind(student.id).first();
  if (existing) return;
  const items = buildBaseFeePlan(student);
  if (!items.length) return;
  await env.DB.batch(await feePlanStatements(env, items, createdBy));
}

function monthKey(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{1,2})$/);
  if (match) return match[1] + "-" + match[2].padStart(2, "0");
  match = text.match(/^(\d{1,2})[/-](\d{4})$/);
  if (match) return match[2] + "-" + match[1].padStart(2, "0");
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 7) : "";
}

function paymentMatches(item, payment, studentId) {
  if (payment.fee_plan_item_id) return payment.fee_plan_item_id === item.id;
  if (payment.student_id !== studentId || payment.fee_category !== item.fee_category) return false;
  if (item.fee_category === "Monthly Fee") return monthKey(payment.period) === monthKey(item.due_date);
  return item.fee_category === "Admission Fee" || item.fee_category === "Certificate Issue Fee";
}

export async function getStudentFeePlan(env, student, { ensure = true } = {}) {
  if (ensure) await ensureStudentFeePlan(env, student);
  const [itemResult, paymentResult, allocationResult] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM student_fee_plan_items WHERE student_id = ? AND is_active = 1 ORDER BY due_date, created_at, id"
    ).bind(student.id).all(),
    env.DB.prepare(
      "SELECT id, receipt_no, student_id, fee_plan_item_id, fee_category, amount, payment_date, period FROM fee_payments WHERE student_id = ? ORDER BY payment_date, created_at"
    ).bind(student.id).all(),
    env.DB.prepare(
      "SELECT a.fee_plan_item_id, p.id AS payment_id, p.receipt_no, a.amount, p.payment_date, p.period FROM student_fee_payment_allocations a JOIN fee_payments p ON p.id = a.payment_id WHERE p.student_id = ? ORDER BY p.payment_date, p.created_at"
    ).bind(student.id).all(),
  ]);
  const today = indiaToday();
  const payments = paymentResult.results || [];
  const allocations = allocationResult.results || [];
  const allocatedPaymentIds = new Set(allocations.map(allocation => allocation.payment_id));
  const items = (itemResult.results || []).map(item => {
    const directReceipts = payments.filter(payment => !allocatedPaymentIds.has(payment.id) && paymentMatches(item, payment, student.id)).map(payment => ({
      id: payment.id, receipt_no: payment.receipt_no, amount: Number(payment.amount),
      payment_date: payment.payment_date, period: payment.period || "",
    }));
    const allocatedReceipts = allocations.filter(allocation => allocation.fee_plan_item_id === item.id).map(allocation => ({
      id: allocation.payment_id, receipt_no: allocation.receipt_no, amount: Number(allocation.amount),
      payment_date: allocation.payment_date, period: allocation.period || "",
    }));
    const receipts = [...directReceipts, ...allocatedReceipts];
    const paid = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const waived = Number(item.is_waived) === 1;
    const amount = Number(item.amount) || 0;
    const remaining = waived ? 0 : Math.max(0, amount - paid);
    const status = waived ? "waived" : remaining <= 0 ? "paid" : item.due_date <= today ? "pending" : "upcoming";
    return {
      id: item.id, fee_category: item.fee_category, description: item.description || item.fee_category,
      amount, paid_amount: Math.min(amount, paid), remaining_amount: remaining, due_date: item.due_date,
      period: item.period || "", is_waived: waived, status, receipts,
    };
  });
  const total = items.filter(item => !item.is_waived).reduce((sum, item) => sum + item.amount, 0);
  const waivedAmount = items.filter(item => item.is_waived).reduce((sum, item) => sum + item.amount, 0);
  const paid = items.reduce((sum, item) => sum + item.paid_amount, 0);
  const pending = items.filter(item => item.status === "pending").reduce((sum, item) => sum + item.remaining_amount, 0);
  const upcoming = items.filter(item => item.status === "upcoming").reduce((sum, item) => sum + item.remaining_amount, 0);
  const duration = Number(student.course_duration_months || courseDurationMonths(student.course_name) || 0);
  const monthlyFee = Number(student.monthly_fee);
  const monthlyItems = items.filter(item => item.fee_category === "Monthly Fee");
  const configured = duration > 0 && Number.isFinite(monthlyFee) && monthlyFee > 0 &&
    monthlyItems.length === duration;
  return {
    student_id: student.id, student_name: student.student_name, roll_no: student.roll_no,
    course_name: student.course_name, duration_months: duration, configured,
    total_amount: total, waived_amount: waivedAmount, paid_amount: paid, pending_amount: pending, upcoming_amount: upcoming,
    outstanding_amount: Math.max(0, total - paid), items,
  };
}

export async function hasUnpaidDues(env, student, { includeCertificateFee = false } = {}) {
  const plan = await getStudentFeePlan(env, student);
  if (!plan.configured) return { blocked: true, plan, reason: "Fee plan is incomplete. Complete the student's fee plan before issuing this record." };
  const blocked = plan.items.some(item => !item.is_waived && item.remaining_amount > 0 &&
    (item.due_date <= indiaToday() || (includeCertificateFee && item.fee_category === "Certificate Issue Fee")));
  return { blocked, plan, reason: blocked ? "Clear the student's due fees before issuing the final marksheet or certificate." : "" };
}

export function todayInIndia() {
  return indiaToday();
}
