import { requireAdmin, sameOrigin } from "../_admin.js";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const account = await requireAdmin(request, env);
  if (account.error) return json({ error: account.error }, account.status);

  const data = await request.json().catch(() => null);
  const to = typeof data?.to === "string" ? data.to.replace(/[ +()-]/g, "") : "";
  if (!/^[1-9]\d{7,14}$/.test(to)) {
    return json({ error: "Enter a WhatsApp number with its country code." }, 400);
  }
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!phoneId || !/^\d+$/.test(phoneId) || !token) {
    return json({ error: "Check the WhatsApp Phone Number ID and access token in Cloudflare." }, 503);
  }

  // This approved template is used for the admin's test message. Do not use
  // the Meta sample template or a stale WHATSAPP_TEST_TEMPLATE_NAME setting.
  const templateName = "masscom_fee_reminder";
  const templateLanguage = "en_US";

  try {
    const response = await fetch(`https://graph.facebook.com/v27.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [{
            type: "body",
            parameters: ["12345", "700", "3", "100"].map(text => ({ type: "text", text })),
          }],
        },
      }),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.messages?.[0]?.id) return json({ success: true });
    const code = result?.error?.code;
    const detail = Number.isInteger(code) ? ` (Meta code ${code})` : "";
    if (code === 190 || response.status === 401) {
      return json({ error: `Check the Meta access token in Cloudflare${detail}.` }, 424);
    }
    if (code === 131030) {
      return json({ error: "Add and verify this recipient under Step 1. Try it out in Meta." }, 400);
    }
    if (code === 132001) {
      return json({ error: `The selected WhatsApp account does not have the ${templateName} template in ${templateLanguage}${detail}.` }, 422);
    }
    return json({ error: `Meta did not accept the test message${detail}.` }, 424);
  } catch {
    return json({ error: "Meta did not return a response. Check WhatsApp before retrying." }, 424);
  }
}
