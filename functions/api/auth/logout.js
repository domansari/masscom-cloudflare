import { hashSessionToken, sameOrigin, sessionToken } from "../_admin.js";

export async function onRequestPost({ request, env }) {
  const headers = {
    "Cache-Control": "no-store",
    "Set-Cookie": "masscom_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  };

  try {
    if (!sameOrigin(request)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!env.DB) {
      return Response.json({ error: "Database unavailable" }, { status: 503 });
    }

    const token = sessionToken(request);
    if (token) {
      await env.DB.prepare("DELETE FROM admin_sessions WHERE id = ?")
        .bind(await hashSessionToken(token)).run();
    }

    return Response.json({ success: true }, { headers });
  } catch {
    return Response.json({ error: "Unable to sign out" }, { status: 500 });
  }
}
