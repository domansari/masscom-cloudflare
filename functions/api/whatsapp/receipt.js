import { requireAdmin, sameOrigin } from "../_admin.js";
import { receiptPhone } from "../../../src/lib/receipt-phone.js";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const account = await requireAdmin(request, env);
  if (account.error) return json({ error: account.error }, account.status);

  const data = await request.json().catch(() => null);
  if (typeof data?.id !== "string" || !data.id || data.id.length > 128 || data.consent !== true) {
    return json({ error: "Select a receipt and confirm the student's consent." }, 400);
  }
  const phoneId = env.WHATSAPP_RECEIPT_PHONE_NUMBER_ID?.trim();
  const token = env.WHATSAPP_RECEIPT_ACCESS_TOKEN?.trim();
  if (!/^\d+$/.test(phoneId || "") || !token) {
    return json({ error: "Live WhatsApp receipts are pending the Meta production sender and approved masscom_fee_receipt template." }, 503);
  }

  const receipt = await env.DB.prepare(
    `SELECT p.receipt_no, p.student_name, p.amount, p.payment_date, s.phone
     FROM fee_payments p JOIN students s ON s.id = p.student_id WHERE p.id = ?`
  ).bind(data.id).first();
  if (!receipt) return json({ error: "Receipt or student not found." }, 404);
  const to = receiptPhone(receipt.phone);
  if (!to || data.to !== to) {
    return json({ error: "The student's registered number is missing or has changed. Refresh the Fees page and check the student record." }, 409);
  }
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(receipt.amount);
  const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(receipt.payment_date + "T00:00:00Z"));
  const name = receipt.student_name.trim().replace(/\s+/g, " ") || "Student";

  try {
    const response = await fetch(`https://graph.facebook.com/v27.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: "masscom_fee_receipt",
          language: { code: "en_US" },
          components: [{ type: "body", parameters: [name, amount, date, receipt.receipt_no].map(text => ({ type: "text", text })) }],
        },
      }),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.messages?.[0]?.id) return json({ success: true });
    const code = result?.error?.code;
    if (code === 190) return json({ error: "Refresh the production WhatsApp access token in Cloudflare." }, 502);
    if (code === 132001) return json({ error: "Meta could not find the approved masscom_fee_receipt template in English (US) for this sender." }, 502);
    return json({ error: `Meta did not accept the receipt${Number.isInteger(code) ? " (code " + code + ")" : ""}.` }, 502);
  } catch {
    return json({ error: "Meta did not return a response. Check delivery before retrying." }, 502);
  }
}
