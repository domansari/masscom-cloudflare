import { requireAdmin, sameOrigin } from "../../_admin.js";
import { verifyPassword } from "../password.js";
import { randomSecret, encryptSecret } from "./_utils.js";

const encoder = new TextEncoder();

async function hashCode(adminId, code, env) {
  const input = encoder.encode(
    `${adminId}:${code}:${env.TOTP_ENCRYPTION_KEY}`
  );
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);

    const auth = await requireAdmin(request, env);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const body = await request.json().catch(() => null);
    const password = body?.password;
    const recoveryCode = body?.recovery_code;

    if (
      typeof password !== "string" ||
      password.length < 1 ||
      password.length > 1024 ||
      typeof recoveryCode !== "string" ||
      !/^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{8}$/.test(recoveryCode)
    ) {
      return json({ error: "Invalid credentials" }, 401);
    }

    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip) return json({ error: "Forbidden" }, 403);

    const identifiers = [
      `totp:recover:${auth.adminId}`,
      `totp:recover:ip:${ip}`
    ];

    const now = Date.now();
    const cutoff = new Date(now - 15 * 60 * 1000).toISOString();

    for (const identifier of identifiers) {
      const attempt = await env.DB.prepare(
        "SELECT blocked_until FROM login_attempts WHERE identifier = ?"
      ).bind(identifier).first();

      if (attempt?.blocked_until &&
          Date.parse(attempt.blocked_until) > now) {
        return json({ error: "Too many attempts. Try again later." }, 429);
      }
    }

    const admin = await env.DB.prepare(
      "SELECT password_hash, email FROM admin_users WHERE id = ?"
    ).bind(auth.adminId).first();

    const validPassword = admin
      ? await verifyPassword(password, admin.password_hash)
      : false;

    const codeHash = await hashCode(
      auth.adminId, recoveryCode.toUpperCase(), env
    );

    const existing = await env.DB.prepare(
      `SELECT code_hash FROM admin_totp_recovery
       WHERE admin_id = ? AND code_hash = ? AND used_at IS NULL`
    ).bind(auth.adminId, codeHash).first();

    const current = await env.DB.prepare(
      `SELECT encrypted_secret FROM admin_totp
       WHERE admin_id = ? AND enabled = 1`
    ).bind(auth.adminId).first();

    if (!validPassword || !existing || !current) {
      const until = new Date(now + 15 * 60 * 1000).toISOString();

      for (const identifier of identifiers) {
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
          identifier, new Date(now).toISOString(),
          cutoff, cutoff, cutoff, until
        ).run();
      }

      return json({ error: "Invalid credentials" }, 401);
    }

    const secret = randomSecret();
    const encrypted = await encryptSecret(secret, env);
    const usedAt = new Date(now).toISOString();

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE admin_totp_recovery
         SET used_at = ?
         WHERE admin_id = ? AND code_hash = ? AND used_at IS NULL`
      ).bind(usedAt, auth.adminId, codeHash),

      env.DB.prepare(
        `INSERT INTO totp_transaction_guard (valid)
         SELECT 0 WHERE changes() != 1`
      ),

      env.DB.prepare(
        `UPDATE admin_totp
         SET encrypted_secret = ?, enabled = 0, last_used_step = -1
         WHERE admin_id = ? AND enabled = 1
           AND encrypted_secret = ?`
      ).bind(encrypted, auth.adminId, current.encrypted_secret),

      env.DB.prepare(
        `INSERT INTO totp_transaction_guard (valid)
         SELECT 0 WHERE changes() != 1`
      )
    ]);

    for (const identifier of identifiers) {
      await env.DB.prepare(
        "DELETE FROM login_attempts WHERE identifier = ?"
      ).bind(identifier).run();
    }

    const uri =
      `otpauth://totp/${encodeURIComponent("MASSCOM:" + admin.email)}` +
      `?secret=${secret}&issuer=MASSCOM&algorithm=SHA1&digits=6&period=30`;

    return json({ otpauth_uri: uri });
  } catch (error) {
    console.error("Authenticator recovery failed", error);
    return json({ error: "Recovery failed" }, 500);
  }
}
