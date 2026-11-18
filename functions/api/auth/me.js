export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) {
      return Response.json({ authenticated: false }, { status: 503 });
    }

    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)masscom_session=([a-f0-9]{64})(?:;|$)/);

    if (!match) {
      return Response.json(
        { authenticated: false },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const tokenBytes = new TextEncoder().encode(match[1]);
    const digest = await crypto.subtle.digest("SHA-256", tokenBytes);
    const tokenHash = Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");

    const session = await env.DB.prepare(
      `SELECT s.admin_id
       FROM admin_sessions s
       JOIN admin_users a ON a.id = s.admin_id
       WHERE s.id = ? AND s.expires_at > ?
       LIMIT 1`
    ).bind(tokenHash, new Date().toISOString()).first();

    return Response.json(
      { authenticated: Boolean(session) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { authenticated: false },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
