import { verifyPassword } from "./auth/password.js";

export async function confirmDeletePassword(request, env, auth) {
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
  return null;
}
