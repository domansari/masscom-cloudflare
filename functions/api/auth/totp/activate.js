import { requireAdmin, sameOrigin } from "../../_admin.js";
import { decryptSecret, verifyCode } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!sameOrigin(request)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const auth = await requireAdmin(request, env);
    if (auth.error) {
      return Response.json({ error: auth.error }, { status: auth.status });
    }


    // Limit failed authenticator activation attempts per administrator.
    const identifier = `totp:activate:${auth.adminId}`;
    const attempt = await env.DB.prepare(
      "SELECT attempts, window_start, blocked_until FROM login_attempts WHERE identifier = ?"
    ).bind(identifier).first();

    const now = Date.now();

    if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > now) {
      return Response.json(
        { error: "Too many attempts. Try again in 15 minutes." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const code = body?.code;

    if (typeof code !== "string" || !/^[0-9]{6}$/.test(code)) {
      return Response.json({ error: "Invalid code" }, { status: 400 });
    }

    const record = await env.DB.prepare(
      "SELECT encrypted_secret, enabled FROM admin_totp WHERE admin_id = ?"
    ).bind(auth.adminId).first();

    if (!record || record.enabled) {
      return Response.json({ error: "Setup unavailable" }, { status: 400 });
    }

    const secret = await decryptSecret(record.encrypted_secret, env);
    const step = await verifyCode(secret, code);

    if (step === null) {
      const windowStart = new Date(now).toISOString();
      const cutoff = new Date(now - 15 * 60 * 1000).toISOString();
      const blockedUntil = new Date(now + 15 * 60 * 1000).toISOString();

      await env.DB.prepare(
        `INSERT INTO login_attempts
         (identifier, attempts, window_start, blocked_until)
         VALUES (?, 1, ?, NULL)
         ON CONFLICT(identifier) DO UPDATE SET
           attempts = CASE
             WHEN window_start < ? THEN 1
             ELSE attempts + 1 END,
           window_start = CASE
             WHEN window_start < ? THEN excluded.window_start
             ELSE window_start END,
           blocked_until = CASE
             WHEN window_start >= ? AND attempts >= 4
             THEN ? ELSE NULL END`
      ).bind(
        identifier, windowStart,
        cutoff, cutoff, cutoff, blockedUntil
      ).run();

      return Response.json({ error: "Incorrect code" }, { status: 401 });
    }

    await env.DB.prepare(
      "DELETE FROM login_attempts WHERE identifier = ?"
    ).bind(identifier).run();

    await env.DB.prepare(
      `UPDATE admin_totp
       SET enabled = 1, last_used_step = ?
       WHERE admin_id = ? AND enabled = 0`
    ).bind(step, auth.adminId).run();

    return Response.json({ success: true });
  } catch (error) {
    console.error("TOTP activation failed", error);
    return Response.json({ error: "Activation failed" }, { status: 500 });
  }
}
