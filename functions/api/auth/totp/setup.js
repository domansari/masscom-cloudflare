import { verifyPassword } from "../password.js";
import { requireAdmin, sameOrigin } from "../../_admin.js";
import { randomSecret, encryptSecret } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!sameOrigin(request)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const auth = await requireAdmin(request, env);
    if (auth.error) {
      return Response.json({ error: auth.error }, { status: auth.status });
    }


    // Require password confirmation before enrolling an authenticator.
    const body = await request.json().catch(() => null);
    const password = body?.password;

    if (
      typeof password !== "string" ||
      password.length === 0 ||
      password.length > 1024
    ) {
      return Response.json(
        { error: "Password confirmation required" },
        { status: 400 }
      );
    }


    // Limit password-confirmation attempts during authenticator setup.
    const identifier = `totp:setup:${auth.adminId}`;
    const now = Date.now();
    const cutoff = new Date(now - 15 * 60 * 1000).toISOString();

    const attempt = await env.DB.prepare(
      "SELECT blocked_until FROM login_attempts WHERE identifier = ?"
    ).bind(identifier).first();

    if (attempt?.blocked_until &&
        Date.parse(attempt.blocked_until) > now) {
      return Response.json(
        { error: "Too many attempts. Try again in 15 minutes." },
        { status: 429 }
      );
    }

    const credentials = await env.DB.prepare(
      "SELECT password_hash FROM admin_users WHERE id = ?"
    ).bind(auth.adminId).first();

    if (
      !credentials ||
      !(await verifyPassword(password, credentials.password_hash))
    ) {
      await env.DB.prepare(
        `INSERT INTO login_attempts
         (identifier, attempts, window_start, blocked_until)
         VALUES (?, 1, ?, NULL)
         ON CONFLICT(identifier) DO UPDATE SET
           attempts = CASE
             WHEN window_start < ? THEN 1 ELSE attempts + 1 END,
           window_start = CASE
             WHEN window_start < ? THEN excluded.window_start
             ELSE window_start END,
           blocked_until = CASE
             WHEN window_start >= ? AND attempts >= 4
             THEN ? ELSE NULL END`
      ).bind(
        identifier,
        new Date(now).toISOString(),
        cutoff, cutoff, cutoff,
        new Date(now + 15 * 60 * 1000).toISOString()
      ).run();

      return Response.json(
        { error: "Incorrect password" },
        { status: 401 }
      );
    }

    await env.DB.prepare(
      "DELETE FROM login_attempts WHERE identifier = ?"
    ).bind(identifier).run();

    const existing = await env.DB.prepare(
      "SELECT enabled FROM admin_totp WHERE admin_id = ?"
    ).bind(auth.adminId).first();

    if (existing?.enabled) {
      return Response.json(
        { error: "Authenticator already enabled" },
        { status: 409 }
      );
    }

    const admin = await env.DB.prepare(
      "SELECT email FROM admin_users WHERE id = ?"
    ).bind(auth.adminId).first();

    if (!admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const secret = randomSecret();
    const encrypted = await encryptSecret(secret, env);

    await env.DB.prepare(
      `INSERT INTO admin_totp (admin_id, encrypted_secret, enabled)
       VALUES (?, ?, 0)
       ON CONFLICT(admin_id) DO UPDATE SET
         encrypted_secret = excluded.encrypted_secret,
         enabled = 0,
         last_used_step = -1`
    ).bind(auth.adminId, encrypted).run();

    const uri = `otpauth://totp/${encodeURIComponent("MASSCOM:" + admin.email)}?secret=${secret}&issuer=MASSCOM&algorithm=SHA1&digits=6&period=30`;

    return Response.json(
      { otpauth_uri: uri },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("TOTP setup failed", error);
    return Response.json({ error: "Setup failed" }, { status: 500 });
  }
}
