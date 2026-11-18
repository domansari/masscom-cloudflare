export async function onRequestPost({ request, env }) {
  const headers = {
    "Cache-Control": "no-store",
    "Set-Cookie": "masscom_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  };

  try {
    if (request.headers.get("Origin") !== new URL(request.url).origin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!env.DB) {
      return Response.json({ error: "Database unavailable" }, { status: 503 });
    }

    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)masscom_session=([a-f0-9]{64})(?:;|$)/);

    if (match) {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(match[1])
      );
      const hash = Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");

      await env.DB.prepare("DELETE FROM admin_sessions WHERE id = ?")
        .bind(hash).run();
    }

    return Response.json({ success: true }, { headers });
  } catch {
    return Response.json({ error: "Unable to sign out" }, { status: 500 });
  }
}
