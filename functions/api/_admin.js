
export function sessionToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie.match(/(?:^|;\s*)masscom_session=((?:v1\.)?[a-f0-9]{64})(?:;|$)/)?.[1];
}

export async function hashSessionToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function requireCertificateUser(request, env) {
  if (!env.DB) return { error: "Database unavailable", status: 503 };

  const token = sessionToken(request);
  if (!token) return { error: "Unauthorized", status: 401 };

  const role = token.startsWith("v1.") ? "verifier" : "admin";
  const account = await env.DB.prepare(
    `SELECT a.id, a.email, a.role FROM admin_sessions s
     JOIN admin_users a ON a.id = s.admin_id
     WHERE s.id = ? AND s.expires_at > ? AND a.role = ? LIMIT 1`
  ).bind(await hashSessionToken(token), new Date().toISOString(), role).first();

  return account ?? { error: "Unauthorized", status: 401 };
}

export async function requireAdmin(request, env) {
  const account = await requireCertificateUser(request, env);
  if (account.error) return account;
  if (account.role !== "admin") return { error: "Forbidden", status: 403 };
  return { adminId: account.id };
}

export function sameOrigin(request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}
