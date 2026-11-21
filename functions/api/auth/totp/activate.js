import { requireAdmin, sameOrigin } from "../../_admin.js";
import { decryptSecret, verifyCode } from "./_utils.js";

const encoder = new TextEncoder();

function hex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function hashRecoveryCode(adminId, code, env) {
  const input = encoder.encode(
    `${adminId}:${code}:${env.TOTP_ENCRYPTION_KEY}`
  );
  const digest = await crypto.subtle.digest("SHA-256", input);
  return hex(new Uint8Array(digest));
}

function generateRecoveryCodes() {
  return Array.from({ length: 8 }, () => {
    const value = hex(crypto.getRandomValues(new Uint8Array(8))).toUpperCase();
    return `${value.slice(0, 8)}-${value.slice(8)}`;
  });
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

    const identifier = `totp:activate:${auth.adminId}`;
    const now = Date.now();

    const attempt = await env.DB.prepare(
      "SELECT blocked_until FROM login_attempts WHERE identifier = ?"
    ).bind(identifier).first();

    if (attempt?.blocked_until &&
        Date.parse(attempt.blocked_until) > now) {
      return json({ error: "Too many attempts. Try again later." }, 429);
    }

    const body = await request.json().catch(() => null);
    const code = body?.code;

    if (typeof code !== "string" || !/^[0-9]{6}$/.test(code)) {
      return json({ error: "Invalid code" }, 400);
    }

    const record = await env.DB.prepare(
      `SELECT encrypted_secret FROM admin_totp
       WHERE admin_id = ? AND enabled = 0`
    ).bind(auth.adminId).first();

    if (!record) return json({ error: "Setup unavailable" }, 409);

    const secret = await decryptSecret(record.encrypted_secret, env);
    const step = await verifyCode(secret, code);

    if (step === null) {
      const cutoff = new Date(now - 15 * 60 * 1000).toISOString();

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
        identifier,
        new Date(now).toISOString(),
        cutoff, cutoff, cutoff,
        new Date(now + 15 * 60 * 1000).toISOString()
      ).run();

      return json({ error: "Incorrect code" }, 401);
    }

    const recoveryCodes = generateRecoveryCodes();
    const hashes = await Promise.all(
      recoveryCodes.map(code => hashRecoveryCode(auth.adminId, code, env))
    );

    // D1 batch rolls back when a statement throws.
    // The guard forces a constraint error if activation did not win.
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE admin_totp
         SET enabled = 1, last_used_step = ?
         WHERE admin_id = ? AND enabled = 0
           AND encrypted_secret = ?`
      ).bind(step, auth.adminId, record.encrypted_secret),

      env.DB.prepare(
        `INSERT INTO totp_transaction_guard (valid)
         SELECT CASE WHEN changes() = 1 THEN 1 ELSE 0 END`
      ),

      ...hashes.map(hash =>
        env.DB.prepare(
          `INSERT INTO admin_totp_recovery (admin_id, code_hash)
           VALUES (?, ?)`
        ).bind(auth.adminId, hash)
      )
    ]);

    await env.DB.prepare(
      "DELETE FROM login_attempts WHERE identifier = ?"
    ).bind(identifier).run();

    return json({ success: true, recovery_codes: recoveryCodes });
  } catch (error) {
    console.error("TOTP activation failed", error);
    return json({ error: "Activation failed" }, 500);
  }
}
