import { requireCertificateUser } from "../_admin.js";

export async function onRequestGet({ request, env }) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const account = await requireCertificateUser(request, env);
    if (account.error) {
      const status = account.status === 401 ? 200 : account.status;
      return Response.json({ authenticated: false }, { status, headers });
    }

    return Response.json({
      authenticated: true,
      user: { id: String(account.id), email: account.email },
      role: account.role
    }, { headers });
  } catch {
    return Response.json({ authenticated: false }, { status: 500, headers });
  }
}
