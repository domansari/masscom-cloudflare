import { requireAdmin, sameOrigin } from "../_admin.js";
import { getStudentFeePlan, todayInIndia } from "../_student-fee-plan.js";
import { receiptPhone } from "../../../src/lib/receipt-phone.js";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function calendarDay(isoDate) {
  return Date.parse(isoDate + "T00:00:00Z");
}

function feePeriodLabel(item) {
  if (item.fee_category === "Monthly Fee") {
    const period = item.period || new Intl.DateTimeFormat("en-US", {
      month: "long", year: "numeric", timeZone: "UTC",
    }).format(new Date(item.due_date + "T00:00:00Z"));
    return period + " monthly fee";
  }
  if (item.fee_category === "Admission Fee") return "admission fee";
  if (item.fee_category === "Reexam Fee") return item.description || "re-exam fee";
  if (item.fee_category === "Certificate Issue Fee") return "certificate issue fee";
  return item.description || item.fee_category || "fee";
}

function formatAmount(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).format(value);
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  const account = await requireAdmin(request, env);
  if (account.error) return json({ error: account.error }, account.status);

  const data = await request.json().catch(() => null);
  if (typeof data?.student_id !== "string" || !data.student_id || data.student_id.length > 128) {
    return json({ error: "Select a student with overdue fees." }, 400);
  }

  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!/^\d+$/.test(phoneId || "") || !token) {
    return json({ error: "Check the WhatsApp Phone Number ID and access token in Cloudflare." }, 503);
  }

  try {
    const student = await env.DB.prepare(
      "SELECT * FROM students WHERE id = ? AND is_active = 1 LIMIT 1"
    ).bind(data.student_id).first();
    if (!student) return json({ error: "Active student not found." }, 404);

    const to = receiptPhone(student.phone);
    if (!to) return json({ error: "This student does not have a valid WhatsApp number in the record." }, 400);

    const plan = await getStudentFeePlan(env, student);
    const today = todayInIndia();
    const overdue = plan.items.filter(item =>
      !item.is_waived && item.remaining_amount > 0.001 && item.due_date <= today
    );
    if (!overdue.length) {
      return json({ error: "No unpaid fees are currently due for this student. Refresh the dashboard." }, 409);
    }

    const failures = [];
    let accepted = 0;
    for (const item of overdue) {
      const period = feePeriodLabel(item);
      const days = Math.max(0, Math.floor((calendarDay(today) - calendarDay(item.due_date)) / 86400000));
      const parameters = [
        period,
        formatAmount(item.remaining_amount),
        String(days),
        "further reminders",
      ];
      try {
        const response = await fetch(`https://graph.facebook.com/v27.0/${phoneId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
              name: "masscom_fee_reminder",
              language: { code: "en_US" },
              components: [{
                type: "body",
                parameters: parameters.map(text => ({ type: "text", text })),
              }],
            },
          }),
          signal: AbortSignal.timeout(12000),
        });
        const result = await response.json().catch(() => null);
        if (response.ok && result?.messages?.[0]?.id) {
          accepted += 1;
          continue;
        }
        const code = result?.error?.code;
        let message = `Meta did not accept the reminder${Number.isInteger(code) ? ` (code ${code})` : ""}.`;
        if (code === 132001) message = "Meta could not find the approved masscom_fee_reminder template in English (US).";
        if (code === 190 || response.status === 401) message = "Refresh the WhatsApp access token in Cloudflare.";
        failures.push({ period, error: message });
        if (code === 132001 || code === 190 || response.status === 401) break;
      } catch {
        failures.push({ period, error: "Meta did not return a response. Check WhatsApp before retrying." });
        break;
      }
    }

    if (!accepted) {
      return json({ success: false, error: failures[0]?.error || "Meta did not accept the reminder.", failures }, 424);
    }
    return json({ success: true, accepted_count: accepted, failures });
  } catch (error) {
    const message = String(error?.message || "");
    if (/no such table: student_fee_plan_items/i.test(message)) {
      return json({ error: "Fee plan database update is required. Apply migrations/0016_fee_plan.sql in D1." }, 503);
    }
    if (/no such table: student_fee_payment_allocations/i.test(message)) {
      return json({ error: "Advance payment database update is required. Apply migrations/0017_fee_payment_allocations.sql in D1." }, 503);
    }
    return json({ error: "Unable to calculate the student's current overdue fees." }, 500);
  }
}
