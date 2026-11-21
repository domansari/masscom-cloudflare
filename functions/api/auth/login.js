import { verifyPassword, verifyVerifierPassword } from "./password.js";
import { createSession } from "./totp/_utils.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) {
      return Response.json({ error: "Service unavailable" }, { status: 503 });
    }

    const origin = request.headers.get("Origin");
    if (origin !== new URL(request.url).origin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (Number(request.headers.get("content-length") || 0) > 4096) {
      return Response.json({ error: "Request too large" }, { status: 413 });
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    const { email, password } = body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 1024
    ) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const admin = await env.DB.prepare(
      "SELECT id, password_hash, role FROM admin_users WHERE email = ?"
    ).bind(email.trim().toLowerCase()).first();

    const clientIp = request.headers.get("CF-Connecting-IP");
    if (!clientIp) {
      return Response.json(
        { error: "Unable to verify client address" },
        { status: 403 }
      );
    }
    const ipIdentifier = `ip:${clientIp}`;
    const identifier = `email:${email.trim().toLowerCase()}`;
    const ipAttempt = await env.DB.prepare(
      "SELECT blocked_until FROM login_attempts WHERE identifier = ?"
    ).bind(ipIdentifier).first();

    if (ipAttempt?.blocked_until &&
        Date.parse(ipAttempt.blocked_until) > Date.now()) {
      return Response.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    const now = new Date();
    const attempt = await env.DB.prepare(
      "SELECT attempts, window_start, blocked_until FROM login_attempts WHERE identifier = ?"
    ).bind(identifier).first();

    if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > now.getTime()) {
      return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const valid = admin?.role === "admin"
      ? await verifyPassword(password, admin.password_hash)
      : admin?.role === "verifier" && await verifyVerifierPassword(password, admin.password_hash);

    if (!valid) {
      const windowStart = attempt ? Date.parse(attempt.window_start) : NaN;
      const inWindow = Number.isFinite(windowStart) &&
        now.getTime() - windowStart < 15 * 60 * 1000;
      const updatedWindowStart = inWindow ? attempt.window_start : now.toISOString();
      const blockedUntil = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

      await env.DB.prepare(
        `INSERT INTO login_attempts (identifier, attempts, window_start, blocked_until)
         VALUES (?, 1, ?, NULL)
         ON CONFLICT(identifier) DO UPDATE SET
           attempts = CASE
             WHEN julianday(login_attempts.window_start) <= julianday('now', '-15 minutes')
             THEN 1 ELSE login_attempts.attempts + 1 END,
           window_start = CASE
             WHEN julianday(login_attempts.window_start) <= julianday('now', '-15 minutes')
             THEN excluded.window_start ELSE login_attempts.window_start END,
           blocked_until = CASE
             WHEN login_attempts.blocked_until > excluded.window_start
             THEN login_attempts.blocked_until
             WHEN julianday(login_attempts.window_start) > julianday('now', '-15 minutes')
                  AND login_attempts.attempts >= 4
             THEN ? ELSE NULL END`
      ).bind(identifier, updatedWindowStart, blockedUntil).run();

      await env.DB.prepare(
        `INSERT INTO login_attempts (identifier, attempts, window_start, blocked_until)
         VALUES (?, 1, ?, NULL)
         ON CONFLICT(identifier) DO UPDATE SET
           attempts = CASE
             WHEN julianday(login_attempts.window_start) <= julianday('now', '-15 minutes')
             THEN 1 ELSE login_attempts.attempts + 1 END,
           window_start = CASE
             WHEN julianday(login_attempts.window_start) <= julianday('now', '-15 minutes')
             THEN excluded.window_start ELSE login_attempts.window_start END,
           blocked_until = CASE
             WHEN login_attempts.blocked_until > excluded.window_start
             THEN login_attempts.blocked_until
             WHEN julianday(login_attempts.window_start) > julianday('now', '-15 minutes')
                  AND login_attempts.attempts >= 19
             THEN ? ELSE NULL END`
      ).bind(ipIdentifier, now.toISOString(), blockedUntil).run();

      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await env.DB.prepare(
      "DELETE FROM login_attempts WHERE identifier = ?"
    ).bind(identifier).run();

    return await createSession(env, admin.id, admin.role);
  } catch (error) {
    console.error("Admin login failed:", error);
    return Response.json({ error: "Unable to sign in" }, { status: 500 });
  }
}
