
export async function requireAdmin(request, env) {
  if (!env.DB) return { error: "Database unavailable", status: 503 };

  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/(?:^|;\\s*)masscom_session=([a-f0-9]{64})(?:;|$)/)?.[1];

  if (!token) return { error: "Unauthorized", status: 401 };

  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(token)
  );
  const hash = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const admin = await env.DB.prepare(
    `SELECT s.admin_id FROM admin_sessions s
     JOIN admin_users a ON a.id = s.admin_id
     WHERE s.id = ? AND s.expires_at > ? LIMIT 1`
  ).bind(hash, new Date().toISOString()).first();

  return admin
    ? { adminId: admin.admin_id }
    : { error: "Unauthorized", status: 401 };
}

export function sameOrigin(request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}
