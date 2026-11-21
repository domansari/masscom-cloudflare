
import { requireAdmin, requireCertificateUser, sameOrigin } from "../_admin.js";
import { confirmDeletePassword } from "../_delete-password.js";

export async function onRequestDelete({ request, env, params }) {
  try {
    if (!sameOrigin(request))
      return Response.json({ error: "Forbidden" }, { status: 403 });

    const auth = await requireAdmin(request, env);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const id = params.id;
    if (typeof id !== "string" || id.length > 128)
      return Response.json({ error: "Invalid ID" }, { status: 400 });

    const passwordError = await confirmDeletePassword(request, env, auth);
    if (passwordError) return passwordError;

    const result = await env.DB.prepare(
      "DELETE FROM certificates WHERE id = ?"
    ).bind(id).run();

    if (!result.meta?.changes)
      return Response.json({ error: "Certificate not found" }, { status: 404 });

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Unable to delete certificate" }, { status: 500 });
  }
}


export async function onRequestGet({ request, env, params }) {
  try {
    const auth = await requireCertificateUser(request, env);
    if (auth.error)
      return Response.json({ error: auth.error }, { status: auth.status });

    const certificate = await env.DB.prepare(
      "SELECT * FROM certificates WHERE id = ? LIMIT 1"
    ).bind(params.id).first();

    if (!certificate)
      return Response.json({ error: "Certificate not found" }, { status: 404 });

    return Response.json(
      { data: certificate },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json({ error: "Unable to load certificate" }, { status: 500 });
  }
}

export async function onRequestPatch({ request, env, params }) {
  try {
    if (!sameOrigin(request))
      return Response.json({ error: "Forbidden" }, { status: 403 });

    const auth = await requireCertificateUser(request, env);
    if (auth.error)
      return Response.json({ error: auth.error }, { status: auth.status });

    const raw = await request.text();
    if (raw.length > 16384)
      return Response.json({ error: "Request too large" }, { status: 413 });

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!data || typeof data !== "object" || Array.isArray(data))
      return Response.json({ error: "Invalid certificate" }, { status: 400 });

    const allowed = [
      "student_name", "father_name", "course_name", "duration",
      "completion_date", "grade", "student_coordinator",
      "roll_no", "batch_number", "instructor_name"
    ];

    const required = new Set([
      "student_name", "course_name", "completion_date"
    ]);

    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(data)) {
      if (!allowed.includes(key)) continue;

      if (value !== null && typeof value !== "string")
        return Response.json({ error: "Invalid " + key }, { status: 400 });

      const cleaned = typeof value === "string" ? value.trim() : null;

      if (cleaned && cleaned.length > 4096)
        return Response.json({ error: "Field too long" }, { status: 400 });

      if (required.has(key) && !cleaned)
        return Response.json({ error: "Missing " + key }, { status: 400 });

      if (key === "completion_date" &&
          !/^\d{4}-\d{2}-\d{2}$/.test(cleaned || ""))
        return Response.json({ error: "Invalid completion date" }, { status: 400 });

      updates.push(key + " = ?");
      values.push(cleaned);
    }

    if (!updates.length)
      return Response.json({ error: "No valid changes" }, { status: 400 });

    const result = await env.DB.prepare(
      `UPDATE certificates SET ${updates.join(", ")},
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(...values, params.id).run();

    if (!result.meta?.changes)
      return Response.json({ error: "Certificate not found" }, { status: 404 });

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Unable to update certificate" }, { status: 500 });
  }
}
