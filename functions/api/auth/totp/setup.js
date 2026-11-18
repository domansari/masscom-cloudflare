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
