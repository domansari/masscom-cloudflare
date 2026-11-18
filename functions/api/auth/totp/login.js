import {
  decryptSecret, verifyCode, validOrigin, createSession
} from "./_utils.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) {
      return Response.json({ error: "Service unavailable" }, { status: 503 });
    }
    if (!validOrigin(request)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const email = body?.email?.trim()?.toLowerCase();
    const code = body?.code;

    if (
      typeof email !== "string" ||
      email.length > 254 ||
      typeof code !== "string" ||
      !/^[0-9]{6}$/.test(code)
    ) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const identifiers = [`totp:email:${email}`, `totp:ip:${ip}`];
    const now = Date.now();

    for (const identifier of identifiers) {
      const attempt = await env.DB.prepare(
        "SELECT blocked_until FROM login_attempts WHERE identifier = ?"
      ).bind(identifier).first();

      if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > now) {
        return Response.json(
          { error: "Too many attempts. Try later." },
          { status: 429 }
        );
      }
    }

    const admin = await env.DB.prepare(
      `SELECT a.id, t.encrypted_secret, t.last_used_step
       FROM admin_users a
       JOIN admin_totp t ON t.admin_id = a.id
       WHERE a.email = ? AND t.enabled = 1`
    ).bind(email).first();

    let step = null;

    if (admin) {
      const secret = await decryptSecret(admin.encrypted_secret, env);
      step = await verifyCode(secret, code);
    }

    if (!admin || step === null || step <= admin.last_used_step) {
      const until = new Date(now + 15 * 60 * 1000).toISOString();
      const windowStart = new Date(now).toISOString();

      for (const identifier of identifiers) {
        await env.DB.prepare(
          `INSERT INTO login_attempts
           (identifier, attempts, window_start, blocked_until)
           VALUES (?, 1, ?, NULL)
           ON CONFLICT(identifier) DO UPDATE SET
             attempts = CASE
               WHEN login_attempts.window_start < ?
               THEN 1 ELSE login_attempts.attempts + 1 END,
             window_start = CASE
               WHEN login_attempts.window_start < ?
               THEN excluded.window_start ELSE login_attempts.window_start END,
             blocked_until = CASE
               WHEN login_attempts.window_start >= ?
                 AND login_attempts.attempts >= 4
               THEN ? ELSE NULL END`
        ).bind(
          identifier, windowStart,
          new Date(now - 15 * 60 * 1000).toISOString(),
          new Date(now - 15 * 60 * 1000).toISOString(),
          new Date(now - 15 * 60 * 1000).toISOString(),
          until
        ).run();
      }

      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const updated = await env.DB.prepare(
      `UPDATE admin_totp SET last_used_step = ?
       WHERE admin_id = ? AND enabled = 1 AND last_used_step < ?`
    ).bind(step, admin.id, step).run();

    if (updated.meta.changes !== 1) {
      return Response.json({ error: "Code already used" }, { status: 401 });
    }

    for (const identifier of identifiers) {
      await env.DB.prepare(
        "DELETE FROM login_attempts WHERE identifier = ?"
      ).bind(identifier).run();
    }

    return createSession(env, admin.id);
  } catch (error) {
    console.error("TOTP login failed", error);
    return Response.json({ error: "Unable to sign in" }, { status: 500 });
  }
}
