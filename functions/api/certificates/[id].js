
import { requireAdmin, sameOrigin } from "../_admin.js";
import { verifyPassword } from "../auth/password.js";

export async function onRequestDelete({ request, env, params }) {
  try {
    if (!sameOrigin(request))
      return Response.json({ error: "Forbidden" }, { status: 403 });

    const auth = await requireAdmin(request, env);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const id = params.id;
    if (typeof id !== "string" || id.length > 128)
      return Response.json({ error: "Invalid ID" }, { status: 400 });

    const raw = await request.text();
    if (raw.length > 2048) return Response.json({ error: "Invalid password" }, { status: 400 });
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "Password required" }, { status: 400 }); }
    const password = body?.password;
    if (typeof password !== "string" || !password || password.length > 1024)
      return Response.json({ error: "Password required" }, { status: 400 });

    const identifier = `certificate:delete:${auth.adminId}`;
    const now = Date.now();
    const attempts = await env.DB.prepare("SELECT blocked_until FROM login_attempts WHERE identifier = ?").bind(identifier).first();
    if (attempts?.blocked_until && Date.parse(attempts.blocked_until) > now)
      return Response.json({ error: "Too many incorrect passwords. Try again later." }, { status: 429 });

    const admin = await env.DB.prepare("SELECT password_hash FROM admin_users WHERE id = ?").bind(auth.adminId).first();
    if (!admin || !(await verifyPassword(password, admin.password_hash))) {
      const current = new Date(now).toISOString(), cutoff = new Date(now - 15 * 60 * 1000).toISOString(), blocked = new Date(now + 15 * 60 * 1000).toISOString();
      await env.DB.prepare(`INSERT INTO login_attempts (identifier, attempts, window_start, blocked_until)
        VALUES (?, 1, ?, NULL) ON CONFLICT(identifier) DO UPDATE SET
        attempts = CASE WHEN window_start < ? THEN 1 ELSE attempts + 1 END,
        window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END,
        blocked_until = CASE WHEN window_start >= ? AND attempts >= 4 THEN ? ELSE NULL END`)
        .bind(identifier, current, cutoff, cutoff, cutoff, blocked).run();
      return Response.json({ error: "Incorrect password" }, { status: 401 });
    }
    await env.DB.prepare("DELETE FROM login_attempts WHERE identifier = ?").bind(identifier).run();

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
    const auth = await requireAdmin(request, env);
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

    const auth = await requireAdmin(request, env);
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
          !/^\\d{4}-\\d{2}-\\d{2}$/.test(cleaned || ""))
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
