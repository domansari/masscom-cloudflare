import { confirmDeletePassword } from "./_delete-password.js";
import { requireAdmin, sameOrigin } from "./_admin.js";
import { buildEnrollmentNo } from "./_student-enrollment.js";
import { getStudentFeePlan, todayInIndia } from "./_student-fee-plan.js";

const categories = ["Monthly Fee", "Admission Fee", "Reexam Fee", "Certificate Issue Fee", "Other"];
const methods = ["Cash", "UPI"];
const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function normalize(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const category = typeof data.fee_category === "string" ? data.fee_category.trim() : "";
  const method = typeof data.payment_method === "string" ? data.payment_method.trim() : "";
  const amount = Number(data.amount);
  const date = typeof data.payment_date === "string" ? data.payment_date.trim() : "";
  const period = typeof data.period === "string" ? data.period.trim() : "";
  const notes = typeof data.notes === "string" ? data.notes.trim() : "";
  const upiReference = typeof data.upi_reference_number === "string" ? data.upi_reference_number.trim() : "";
  const mrNumber = typeof data.mr_number === "string" ? data.mr_number.trim() : "";
  if (!categories.includes(category) || !methods.includes(method) ||
      !Number.isFinite(amount) || amount <= 0 || amount > 100000000 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || period.length > 40 || notes.length > 500 || upiReference.length > 120 || mrNumber.length > 100 || (method === "UPI" && !upiReference)) return null;
  const parsed = new Date(date + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return { fee_category: category, payment_method: method, upi_reference_number: method === "UPI" ? upiReference : null, mr_number: mrNumber || null, amount, payment_date: date, period: period || null, notes: notes || null };
}


const mappingSnapshot = `SELECT json_array(
  (SELECT json_group_array(json(row_data)) FROM (
    SELECT json_array(id, fee_plan_item_id, fee_category, amount, period) AS row_data
    FROM fee_payments WHERE student_id = ?1 ORDER BY id
  )),
  (SELECT json_group_array(json(row_data)) FROM (
    SELECT json_array(a.id, a.payment_id, a.fee_plan_item_id, a.amount) AS row_data
    FROM student_fee_payment_allocations a JOIN fee_payments p ON p.id = a.payment_id
    WHERE p.student_id = ?1 ORDER BY a.id
  )),
  (SELECT json_group_array(json(row_data)) FROM (
    SELECT json_array(id, fee_category, amount, period, due_date, is_waived, is_active) AS row_data
    FROM student_fee_plan_items WHERE student_id = ?1 ORDER BY id
  ))
) AS snapshot`;

async function changeFeeMonth(env, id, data) {
  const fromId = data?.from_item_id;
  const toId = data?.to_item_id;
  if (typeof fromId !== "string" || typeof toId !== "string" ||
      !fromId || !toId || fromId === toId || fromId.length > 256 || toId.length > 256) {
    return json({ error: "Select two different fee months." }, 400);
  }
  const payment = await env.DB.prepare("SELECT id, student_id FROM fee_payments WHERE id = ?").bind(id).first();
  if (!payment) return json({ error: "Fee record not found." }, 404);
  const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(payment.student_id).first();
  if (!student) return json({ error: "Student not found." }, 404);

  const snapshot = await env.DB.prepare(mappingSnapshot).bind(student.id).first();
  const plan = await getStudentFeePlan(env, student, { ensure: false });
  const months = plan.items.filter(item => item.fee_category === "Monthly Fee");
  const from = months.find(item => item.id === fromId);
  const to = months.find(item => item.id === toId);
  const receipt = from?.receipts.find(entry => entry.id === id);
  if (!receipt || !to || to.is_waived || to.receipts.some(entry => entry.id === id) ||
      receipt.amount > to.remaining_amount + 0.001) {
    return json({ error: "Select a month with enough unpaid balance that this receipt does not already cover." }, 409);
  }

  const allocations = await env.DB.prepare(
    "SELECT id, fee_plan_item_id FROM student_fee_payment_allocations WHERE payment_id = ?"
  ).bind(id).all();
  const snapshotValue = snapshot.snapshot;
  const stale = () => json({ error: "The fee plan changed. Reopen the receipt and try again." }, 409);
  if (!allocations.results.length) {
    const result = await env.DB.prepare(
      `UPDATE fee_payments SET fee_plan_item_id = ?2, period = ?3,
        notes = CASE WHEN notes LIKE 'Monthly fee for: %' THEN 'Monthly fee for: ' || ?3 ELSE notes END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?4 AND (${mappingSnapshot}) = ?5`
    ).bind(student.id, to.id, to.period, id, snapshotValue).run();
    return result.meta.changes ? json({ success: true }) : stale();
  }

  const allocation = allocations.results.find(entry => entry.fee_plan_item_id === fromId);
  if (!allocation) return stale();
  const [moved] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE student_fee_payment_allocations SET fee_plan_item_id = ?2
       WHERE id = ?3 AND (${mappingSnapshot}) = ?4`
    ).bind(student.id, to.id, allocation.id, snapshotValue),
    env.DB.prepare(
      `WITH installments AS (
         SELECT i.period, i.description FROM student_fee_payment_allocations a
         JOIN student_fee_plan_items i ON i.id = a.fee_plan_item_id
         WHERE a.payment_id = ?1 ORDER BY i.due_date, i.id
       )
       UPDATE fee_payments SET
         period = (SELECT CASE WHEN COUNT(*) = 1 THEN MAX(period) ELSE 'Multiple installments' END FROM installments),
         notes = CASE WHEN notes LIKE 'Monthly fee for: %' OR notes LIKE 'Plan installments: %'
           THEN (SELECT substr('Plan installments: ' || group_concat(COALESCE(NULLIF(period, ''), description), ', '), 1, 500) FROM installments)
           ELSE notes END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?1 AND changes() = 1`
    ).bind(id),
  ]);
  return moved.meta.changes ? json({ success: true }) : stale();
}

export async function onRequest({ request, env }) {
  try {
    const method = request.method;
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return json({ error: "Method not allowed" }, 405);
    if (method !== "GET" && !sameOrigin(request)) return json({ error: "Forbidden" }, 403);
    const account = await requireAdmin(request, env);
    if (account.error) return json({ error: account.error }, account.status);

    if (method === "GET") {
      const result = await env.DB.prepare(
        "SELECT * FROM fee_payments ORDER BY payment_date DESC, created_at DESC"
      ).all();
      return json({ data: result.results || [] });
    }

    const id = new URL(request.url).searchParams.get("id");
    if (method !== "POST" && (!id || id.length > 128)) return json({ error: "Invalid fee record ID" }, 400);

    if (method === "DELETE") {
      const passwordError = await confirmDeletePassword(request, env, account);
      if (passwordError) return passwordError;
      const result = await env.DB.prepare("DELETE FROM fee_payments WHERE id = ?").bind(id).run();
      return result.meta.changes ? json({ success: true }) : json({ error: "Fee record not found" }, 404);
    }

    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Request too large" }, 413);
    const data = JSON.parse(raw);
    if (method === "PATCH") return await changeFeeMonth(env, id, data);
    const payment = normalize(data);
    if (!payment) return json({ error: "Enter a valid amount, date, fee type, and payment method." }, 400);

    if (method === "POST") {
      const studentId = typeof data.student_id === "string" ? data.student_id.trim() : "";
      if (!studentId || studentId.length > 128) return json({ error: "Select a valid student." }, 400);
      const student = await env.DB.prepare(
        "SELECT * FROM students WHERE id = ? LIMIT 1"
      ).bind(studentId).first();
      if (!student) return json({ error: "Student not found." }, 404);
      if (!student.is_active) return json({ error: "Restore this student before collecting a fee." }, 409);
      let planItemId = typeof data.fee_plan_item_id === "string" ? data.fee_plan_item_id.trim() : "";
      const allocationIds = Array.isArray(data.fee_plan_item_ids)
        ? [...new Set(data.fee_plan_item_ids.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean))]
        : [];
      if (payment.fee_category === "Monthly Fee" && !planItemId && !allocationIds.length) {
        return json({ error: "Select the unpaid month or months this Monthly Fee payment covers." }, 400);
      }
      if (allocationIds.length > 200 || (planItemId && allocationIds.length)) return json({ error: "Select a valid set of fee plan installments." }, 400);
      if (!allocationIds.length && !planItemId && ["Admission Fee", "Reexam Fee", "Certificate Issue Fee"].includes(payment.fee_category)) {
        const plan = await getStudentFeePlan(env, student);
        const candidates = plan.items.filter(item => item.fee_category === payment.fee_category && !item.is_waived && item.remaining_amount > 0.001 && item.status === "pending");
        if (!candidates.length) {
          const message = payment.fee_category === "Certificate Issue Fee"
            ? "Activate the ₹250 certificate issue fee before collecting it."
            : payment.fee_category === "Reexam Fee"
              ? "Activate a re-exam fee for this student before collecting it."
              : "No admission fee is currently due for this student.";
          return json({ error: message }, 409);
        }
        const candidate = candidates.sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
        if (payment.amount > candidate.remaining_amount + 0.001) return json({ error: "Payment exceeds the remaining balance for this fee." }, 400);
        planItemId = candidate.id;
        payment.period = candidate.period || "";
      }
      let allocations = [];
      if (allocationIds.length) {
        const planItems = await Promise.all(allocationIds.map(itemId => env.DB.prepare(
          "SELECT * FROM student_fee_plan_items WHERE id = ? AND student_id = ? AND is_active = 1"
        ).bind(itemId, studentId).first()));
        if (planItems.some(item => !item || Number(item.is_waived))) return json({ error: "One or more selected fee plan items are no longer payable." }, 409);
        const itemCategories = [...new Set(planItems.map(item => item.fee_category))];
        if ((itemCategories.length === 1 && payment.fee_category !== itemCategories[0]) ||
            (itemCategories.length > 1 && payment.fee_category !== "Other")) {
          return json({ error: "Payment fee type must match the selected fee plan items." }, 409);
        }
        const planSnapshot = await getStudentFeePlan(env, student);
        const currentById = new Map(planSnapshot.items.map(item => [item.id, item]));
        const selectedPlanItems = planItems.map(item => ({ item, current: currentById.get(item.id) }));
        if (selectedPlanItems.some(entry => !entry.current || entry.current.remaining_amount <= 0.001)) {
          return json({ error: "One or more selected fees have already been paid." }, 409);
        }
        if (selectedPlanItems.some(entry => entry.item.fee_category === "Monthly Fee" && entry.current.status !== "pending" && entry.current.status !== "upcoming")) {
          return json({ error: "Only monthly fees that are currently due can be collected." }, 409);
        }
        allocations = selectedPlanItems.map(({ item, current }) => ({ item, amount: current.remaining_amount }));
        const allocationTotal = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
        if (!allocations.length || payment.amount > allocationTotal + 0.001) {
          return json({ error: "Payment amount cannot exceed the selected months' remaining balances." }, 400);
        }
        let amountToAllocate = payment.amount;
        allocations = allocations.sort((a, b) => a.item.due_date.localeCompare(b.item.due_date)).map(allocation => {
          const amount = Math.min(allocation.amount, amountToAllocate);
          amountToAllocate = Math.max(0, amountToAllocate - amount);
          return { ...allocation, amount };
        }).filter(allocation => allocation.amount > 0.001);
      } else if (planItemId) {
        const planItem = await env.DB.prepare("SELECT * FROM student_fee_plan_items WHERE id = ? AND student_id = ? AND is_active = 1").bind(planItemId, studentId).first();
        if (!planItem || Number(planItem.is_waived) || planItem.fee_category !== payment.fee_category || (planItem.period || "") !== (payment.period || "")) {
          return json({ error: "That fee plan item is invalid, inactive, or does not match the payment." }, 409);
        }
        const feePlan = await getStudentFeePlan(env, student);
        const currentItem = feePlan.items.find(item => item.id === planItemId);
        if (!currentItem || currentItem.remaining_amount <= 0.001) return json({ error: "This fee has already been paid." }, 409);
        if (currentItem.fee_category === "Monthly Fee" && currentItem.status !== "pending" && currentItem.status !== "upcoming") {
          return json({ error: "Only monthly fees that are currently due can be collected." }, 409);
        }
        if (payment.amount > currentItem.remaining_amount + 0.001) {
          return json({ error: "Payment amount is greater than the remaining fee plan balance." }, 400);
        }
      }
      const includesMonthly = payment.fee_category === "Monthly Fee" || allocations.some(allocation => allocation.item.fee_category === "Monthly Fee");
      if (includesMonthly) {
        const feePlan = await getStudentFeePlan(env, student);
        const admissionFee = feePlan.items.find(item => item.fee_category === "Admission Fee");
        if (admissionFee && admissionFee.remaining_amount > 0.001) {
          return json({ error: "Pay the full Admission Fee before collecting any Monthly Fee." }, 409);
        }
      }
      const id = crypto.randomUUID();
      const receiptNo = "FEE-" + new Date().getFullYear() + "-" + id.slice(0, 8).toUpperCase();
      const insertPayment = env.DB.prepare(
        `INSERT INTO fee_payments
         (id, receipt_no, student_id, student_name, enrollment_no, fee_category, amount, payment_date,
          payment_method, upi_reference_number, mr_number, fee_plan_item_id, period, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, receiptNo, student.id, student.student_name, buildEnrollmentNo(student), payment.fee_category,
        payment.amount, payment.payment_date, payment.payment_method, payment.upi_reference_number,
        payment.mr_number, planItemId || null, payment.period, payment.notes, account.adminId);
      if (allocations.length) {
        const statements = [insertPayment, ...allocations.map(allocation => env.DB.prepare(
          "INSERT INTO student_fee_payment_allocations (id, payment_id, fee_plan_item_id, amount) VALUES (?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), id, allocation.item.id, allocation.amount))];
        await env.DB.batch(statements);
      } else await insertPayment.run();
      return json({ success: true, id, receipt_no: receiptNo, allocations: allocations.map(({ item, amount }) => ({ description: item.description, period: item.period, amount })) }, 201);
    }

    const linkedPayment = await env.DB.prepare("SELECT id, student_id, fee_plan_item_id FROM fee_payments WHERE id = ?").bind(id).first();
    const allocationsForPayment = await env.DB.prepare("SELECT COUNT(*) AS count FROM student_fee_payment_allocations WHERE payment_id = ?").bind(id).first();
    const requestedAllocationIds = Array.isArray(data.fee_plan_item_ids)
      ? [...new Set(data.fee_plan_item_ids.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean))]
      : [];
    if (requestedAllocationIds.length > 200) return json({ error: "Select at most 200 fee plan installments." }, 400);
    if (requestedAllocationIds.length) {
      if (!linkedPayment) return json({ error: "Fee record not found." }, 404);
      if (linkedPayment.fee_plan_item_id || Number(allocationsForPayment?.count || 0) > 0) {
        return json({ error: "This receipt is already linked to a fee plan and cannot be reassigned." }, 409);
      }
      const planItems = await Promise.all(requestedAllocationIds.map(itemId => env.DB.prepare(
        "SELECT * FROM student_fee_plan_items WHERE id = ? AND student_id = ? AND is_active = 1"
      ).bind(itemId, linkedPayment?.student_id).first()));
      if (planItems.some(item => !item || Number(item.is_waived))) {
        return json({ error: "One or more selected fee plan items are no longer payable." }, 409);
      }
      const itemCategories = [...new Set(planItems.map(item => item.fee_category))];
      if ((itemCategories.length === 1 && payment.fee_category !== itemCategories[0]) ||
          (itemCategories.length > 1 && payment.fee_category !== "Other")) {
        return json({ error: "Payment fee type must match the selected fee plan items." }, 409);
      }
      if (itemCategories.includes("Monthly Fee")) {
        const student = await env.DB.prepare("SELECT * FROM students WHERE id = ? LIMIT 1").bind(linkedPayment.student_id).first();
        const feePlan = student ? await getStudentFeePlan(env, student) : null;
        const admissionFee = feePlan?.items.find(item => item.fee_category === "Admission Fee");
        if (admissionFee && admissionFee.remaining_amount > 0.001) {
          return json({ error: "Pay the full Admission Fee before collecting any Monthly Fee." }, 409);
        }
      }
      const student = await env.DB.prepare("SELECT * FROM students WHERE id = ? LIMIT 1").bind(linkedPayment.student_id).first();
      if (!student) return json({ error: "Student not found." }, 404);
      const planSnapshot = await getStudentFeePlan(env, student);
      const currentById = new Map(planSnapshot.items.map(item => [item.id, item]));
      const allocations = planItems.map(item => ({ item, current: currentById.get(item.id) }));
      if (allocations.some(entry => !entry.current || entry.current.remaining_amount <= 0.001)) {
        return json({ error: "One or more selected fees have already been paid." }, 409);
      }
      if (allocations.some(entry => entry.item.fee_category === "Monthly Fee" && entry.current.status !== "pending" && entry.current.status !== "upcoming")) {
        return json({ error: "Only monthly fees that are currently due can be collected." }, 409);
      }
      let payable = allocations.map(({ item, current }) => ({ item, amount: current.remaining_amount }));
      const total = payable.reduce((sum, allocation) => sum + allocation.amount, 0);
      if (!payable.length || payment.amount > total + 0.001) {
        return json({ error: "Receipt amount cannot exceed the selected months' remaining balances." }, 400);
      }
      let amountToAllocate = payment.amount;
      payable = payable.sort((a, b) => a.item.due_date.localeCompare(b.item.due_date)).map(allocation => {
        const amount = Math.min(allocation.amount, amountToAllocate);
        amountToAllocate = Math.max(0, amountToAllocate - amount);
        return { ...allocation, amount };
      }).filter(allocation => allocation.amount > 0.001);
      const update = env.DB.prepare(
        `UPDATE fee_payments SET fee_category = ?, amount = ?, payment_date = ?,
         payment_method = ?, upi_reference_number = ?, mr_number = ?, period = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(payment.fee_category, payment.amount, payment.payment_date, payment.payment_method,
        payment.upi_reference_number, payment.mr_number, payment.period, payment.notes, id);
      const statements = [update, ...payable.map(allocation => env.DB.prepare(
        "INSERT INTO student_fee_payment_allocations (id, payment_id, fee_plan_item_id, amount) VALUES (?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), id, allocation.item.id, allocation.amount))];
      await env.DB.batch(statements);
      return json({ success: true, id, allocations: payable.map(({ item, amount }) => ({ period: item.period, amount })) });
    }
    if (payment.fee_category === "Monthly Fee" && !linkedPayment?.fee_plan_item_id && Number(allocationsForPayment?.count || 0) === 0) {
      return json({ error: "Select the unpaid month or months this Monthly Fee receipt covers." }, 400);
    }
    if (Number(allocationsForPayment?.count || 0) > 0) {
      const original = await env.DB.prepare("SELECT amount, fee_category FROM fee_payments WHERE id = ?").bind(id).first();
      if (!original || Number(original.amount) !== payment.amount || original.fee_category !== payment.fee_category) {
        return json({ error: "The total or fee type of an allocated receipt cannot be changed. Delete it and collect again if needed." }, 409);
      }
    }
    if (payment.fee_category === "Monthly Fee" && linkedPayment?.student_id) {
      const student = await env.DB.prepare("SELECT * FROM students WHERE id = ? LIMIT 1").bind(linkedPayment.student_id).first();
      if (student) {
        const feePlan = await getStudentFeePlan(env, student);
        const admissionFee = feePlan.items.find(item => item.fee_category === "Admission Fee");
        if (admissionFee && admissionFee.remaining_amount > 0.001) {
          return json({ error: "Pay the full Admission Fee before collecting any Monthly Fee." }, 409);
        }
      }
    }
    if (linkedPayment?.fee_plan_item_id) {
      const planItem = await env.DB.prepare("SELECT * FROM student_fee_plan_items WHERE id = ? AND student_id = ? AND is_active = 1").bind(linkedPayment.fee_plan_item_id, linkedPayment.student_id).first();
      if (!planItem || Number(planItem.is_waived) || planItem.fee_category !== payment.fee_category || (planItem.period || "") !== (payment.period || "")) {
        return json({ error: "Keep the receipt aligned with its fee plan item." }, 409);
      }
      if (planItem.fee_category === "Monthly Fee" && planItem.due_date > todayInIndia()) {
        return json({ error: "Only monthly fees that are currently due can be collected." }, 409);
      }
      const [otherPaid, otherAllocated] = await Promise.all([
        env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS amount FROM fee_payments WHERE fee_plan_item_id = ? AND id <> ?").bind(planItem.id, id).first(),
        env.DB.prepare("SELECT COALESCE(SUM(a.amount), 0) AS amount FROM student_fee_payment_allocations a JOIN fee_payments p ON p.id = a.payment_id WHERE a.fee_plan_item_id = ? AND p.id <> ?").bind(planItem.id, id).first(),
      ]);
      if (Number(otherPaid?.amount || 0) + Number(otherAllocated?.amount || 0) + payment.amount > Number(planItem.amount) + 0.001) {
        return json({ error: "Payment amount is greater than the remaining fee plan balance." }, 400);
      }
    }

    await env.DB.prepare(
      `UPDATE fee_payments SET fee_category = ?, amount = ?, payment_date = ?,
       payment_method = ?, upi_reference_number = ?, mr_number = ?, period = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(payment.fee_category, payment.amount, payment.payment_date, payment.payment_method,
      payment.upi_reference_number, payment.mr_number, payment.period, payment.notes, id).run();
    const updated = await env.DB.prepare("SELECT id FROM fee_payments WHERE id = ?").bind(id).first();
    return updated ? json({ success: true, id }) : json({ error: "Fee record not found" }, 404);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid request" }, 400);
    const message = String(error?.message || "");
    if (/no such column: mr_number/i.test(message)) return json({ error: "MR number database update is required. Apply migrations/0019_fee_payment_mr_number.sql in D1, then try again." }, 503);
    if (/no such table: fee_payments/i.test(message)) return json({ error: "Fee database update is required. Apply the fee payment migration in D1, then try again." }, 503);
    if (/no such table: student_fee_payment_allocations/i.test(message)) return json({ error: "Advance payment database update is required. Apply migrations/0017_fee_payment_allocations.sql in D1, then try again." }, 503);
    if (/no such table: student_fee_plan_items|no such column: fee_plan_item_id/i.test(message)) return json({ error: "Fee plan database update is required. Apply migrations/0016_fee_plan.sql in D1, then try again." }, 503);
    return json({ error: "Unable to complete the fee request" }, 500);
  }
}
