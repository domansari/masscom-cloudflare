import { requireAdmin, sameOrigin } from "./_admin.js";
import { onRequest as addMarksheet } from "./marksheets.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const admin = await requireAdmin(request, env);
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status });

    const raw = await request.text();
    if (raw.length > 16384) return Response.json({ error: "Row is too large" }, { status: 413 });
    const row = JSON.parse(raw)?.row;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return Response.json({ error: "Invalid spreadsheet row" }, { status: 400 });
    }

    delete row.certificate_ref;
    if (row.linked_certificate_id) {
      const linked = await env.DB.prepare("SELECT id FROM certificates WHERE certificate_id = ?")
        .bind(row.linked_certificate_id).first();
      if (!linked) return Response.json({ error: "Linked certificate ID not found." }, { status: 400 });
      row.certificate_ref = linked.id;
    }

    const { origin } = new URL(request.url);
    const forwarded = new Request(`${origin}/api/marksheets`, {
      method: "POST", body: JSON.stringify(row),
      headers: { Origin: origin, Cookie: request.headers.get("Cookie") ?? "", "Content-Type": "application/json" },
    });
    return await addMarksheet({ request: forwarded, env, allowLegacyRegistration: true });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid spreadsheet row" }, { status: 400 });
    return Response.json({ error: "Unable to import the row" }, { status: 500 });
  }
}
