import { requireAdmin, sameOrigin } from "./_admin.js";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function phoneNumber(value) {
  const digits = (value || "").trim().replace(/[ +()-]/g, "").replace(/^0(?=\d{10}$)/, "");
  const phone = /^\d{10}$/.test(digits) ? "91" + digits : digits;
  return /^[1-9]\d{9,14}$/.test(phone) ? phone : "";
}

function validDate(value) {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateLabel(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(value + "T00:00:00Z"));
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  const account = await requireAdmin(request, env);
  if (account.error) return json({ error: account.error }, account.status);

  const data = await request.json().catch(() => null);
  if (typeof data?.student_id !== "string" || !data.student_id ||
      !validDate(data.start) || !validDate(data.end) || !validDate(data.resume) ||
      data.start > data.end || data.resume <= data.end) {
    return json({ error: "Check the vacation dates and select a student." }, 400);
  }

  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!/^\d+$/.test(phoneId || "") || !token) {
    return json({ error: "Set the WhatsApp Phone Number ID and access token in Cloudflare." }, 503);
  }

  try {
    const student = await env.DB.prepare(
      `SELECT s.id, s.phone, c.phone AS consent_phone
       FROM students s LEFT JOIN student_notice_consent c ON c.student_id = s.id
       WHERE s.id = ? AND s.is_active = 1 LIMIT 1`
    ).bind(data.student_id).first();

    if (!student) return json({ error: "Active student not found." }, 404);
    const to = phoneNumber(student.phone);
    if (!to) return json({ error: "This student does not have a valid phone number." }, 400);
    if (to !== student.consent_phone) {
      return json({ error: "WhatsApp notice consent is not recorded for this phone number." }, 403);
    }

    const response = await fetch(`https://graph.facebook.com/v27.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: "masscom_vacation_notice",
          language: { code: "en" },
          components: [{
            type: "body",
            parameters: [data.start, data.end, data.resume].map(value => ({
              type: "text",
              text: dateLabel(value),
            })),
          }],
        },
      }),
      signal: AbortSignal.timeout(12000),
    });

    const result = await response.json().catch(() => null);
    if (response.ok && result?.messages?.[0]?.id) {
      return json({ success: true, message_id: result.messages[0].id });
    }
    const code = result?.error?.code;
    if (code === 132001) {
      return json({ error: "Meta could not find the approved masscom_vacation_notice template in English (en).", fatal: true }, 422);
    }
    if (code === 190 || response.status === 401) {
      return json({ error: "Refresh the WhatsApp access token in Cloudflare.", fatal: true }, 424);
    }
    return json({
      error: `Meta did not accept the notice${Number.isInteger(code) ? ` (code ${code})` : ""}.`,
    }, 424);
  } catch (error) {
    if (/no such table: student_notice_consent/i.test(String(error?.message))) {
      return json({ error: "Apply the Student Notices migration to the production D1 database.", fatal: true }, 503);
    }
    return json({ error: "Meta did not return a response. Check the WhatsApp account before retrying." }, 424);
  }
}
