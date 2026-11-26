import { requireAdmin } from "../_admin.js";
import { getStudentFeePlan, todayInIndia } from "../_student-fee-plan.js";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
});

async function mapWithLimit(items, limit, callback) {
  const output = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await callback(items[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

function addDays(isoDate, days) {
  const date = new Date(isoDate + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function groupByStudent(items) {
  const grouped = new Map();
  for (const item of items) {
    let student = grouped.get(item.student_id);
    if (!student) {
      student = { ...item, remaining_amount: 0, items: [], period: "" };
      grouped.set(item.student_id, student);
    }
    student.items.push({
      fee_category: item.fee_category,
      period: item.period,
      due_date: item.due_date,
      remaining_amount: item.remaining_amount,
    });
    student.remaining_amount += item.remaining_amount;
    if (item.due_date < student.due_date) student.due_date = item.due_date;
  }
  return [...grouped.values()].map(student => ({
    ...student,
    period: [...new Set(student.items.map(item => item.period))].join(", "),
  }));
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const account = await requireAdmin(request, env);
  if (account.error) return json({ error: account.error }, account.status);

  try {
    const includeItems = new URL(request.url).searchParams.get("include_items") !== "0";
    const today = todayInIndia();
    const monthStart = today.slice(0, 7) + "-01";
    const nextSevenDays = addDays(today, 7);
    const [collection, studentResult] = await Promise.all([
      env.DB.prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN payment_date = ? THEN amount ELSE 0 END), 0) AS today_amount,
          COALESCE(SUM(amount), 0) AS month_amount,
          SUM(CASE WHEN payment_date = ? THEN 1 ELSE 0 END) AS today_receipts,
          COUNT(*) AS month_receipts
         FROM fee_payments WHERE payment_date >= ? AND payment_date <= ?`
      ).bind(today, today, monthStart, today).first(),
      env.DB.prepare(
        "SELECT * FROM students WHERE is_active = 1 ORDER BY student_name COLLATE NOCASE"
      ).all(),
    ]);

    const students = studentResult.results || [];
    const studentsById = new Map(students.map(student => [student.id, student]));
    const plans = await mapWithLimit(students, 8, student => getStudentFeePlan(env, student));
    const overdueItems = [];
    const upcomingItems = [];
    for (const plan of plans) {
      for (const item of plan.items) {
        if (item.is_waived || item.remaining_amount <= 0.001) continue;
        const due = {
          student_id: plan.student_id,
          student_name: plan.student_name,
          father_name: studentsById.get(plan.student_id)?.father_name || "",
          phone: studentsById.get(plan.student_id)?.phone || "",
          roll_no: plan.roll_no || "",
          course_name: plan.course_name || "",
          fee_category: item.fee_category,
          period: item.period || item.description || item.fee_category,
          due_date: item.due_date,
          remaining_amount: item.remaining_amount,
        };
        if (item.due_date <= today) overdueItems.push(due);
        else if (item.due_date <= nextSevenDays) upcomingItems.push(due);
      }
    }

    const overdueDues = groupByStudent(overdueItems)
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.student_name.localeCompare(b.student_name));
    const upcomingDues = groupByStudent(upcomingItems)
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.student_name.localeCompare(b.student_name));
    return json({
      data: {
        today,
        today_collection: Number(collection?.today_amount || 0),
        today_receipts: Number(collection?.today_receipts || 0),
        month_collection: Number(collection?.month_amount || 0),
        month_receipts: Number(collection?.month_receipts || 0),
        overdue_amount: overdueItems.reduce((sum, item) => sum + item.remaining_amount, 0),
        overdue_students: overdueDues.length,
        overdue_items: includeItems ? overdueDues : [],
        upcoming_amount: upcomingItems.reduce((sum, item) => sum + item.remaining_amount, 0),
        upcoming_students: upcomingDues.length,
        upcoming_items: includeItems ? upcomingDues : [],
      },
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (/no such table: student_fee_payment_allocations/i.test(message)) {
      return json({ error: "Advance payment database update is required. Apply migrations/0017_fee_payment_allocations.sql in D1." }, 503);
    }
    if (/no such table: student_fee_plan_items/i.test(message)) {
      return json({ error: "Fee plan database update is required. Apply migrations/0016_fee_plan.sql in D1." }, 503);
    }
    if (/no such table: fee_payments/i.test(message)) {
      return json({ error: "Fee collection database update is required. Apply the fee payment migrations in D1." }, 503);
    }
    return json({ error: "Unable to load fee dashboard." }, 500);
  }
}
