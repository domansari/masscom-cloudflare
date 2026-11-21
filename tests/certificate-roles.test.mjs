import assert from "node:assert/strict";
import { createHash, pbkdf2Sync } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Secret, TOTP } from "otpauth";
import { onRequestPost as login } from "../functions/api/auth/login.js";
import { onRequestPost as logout } from "../functions/api/auth/logout.js";
import { onRequestGet as me } from "../functions/api/auth/me.js";
import { onRequestPost as setup } from "../functions/api/auth/totp/setup.js";
import { onRequestPost as activate } from "../functions/api/auth/totp/activate.js";
import { onRequestPost as recover } from "../functions/api/auth/totp/recover.js";
import { onRequestPost as totpLogin } from "../functions/api/auth/totp/login.js";
import { encryptSecret } from "../functions/api/auth/totp/_utils.js";
import { onRequestGet as list, onRequestPost as create } from "../functions/api/certificates/index.js";
import { onRequestDelete as remove, onRequestGet as view, onRequestPatch as edit } from "../functions/api/certificates/[id].js";
import { onRequestGet as verify } from "../functions/api/verify.js";

const origin = "https://certificates.example";
const password = "fixture password";
const salt = Buffer.alloc(16, 1);
const hash = `pbkdf2:${salt.toString("hex")}:${pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex")}`;

test("certificate permissions preserve legacy admins and constrain verifier sessions", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE admin_users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT);
    CREATE TABLE admin_sessions (id TEXT PRIMARY KEY, admin_id TEXT REFERENCES admin_users(id), expires_at TEXT);
    CREATE TABLE login_attempts (identifier TEXT PRIMARY KEY, attempts INTEGER, window_start TEXT, blocked_until TEXT);
    CREATE TABLE admin_totp (admin_id TEXT PRIMARY KEY, encrypted_secret TEXT, enabled INTEGER, last_used_step INTEGER);
    CREATE TABLE certificates (
      id TEXT PRIMARY KEY, certificate_id TEXT UNIQUE, student_name TEXT,
      course_name TEXT, completion_date TEXT, qr_code_data TEXT, father_name TEXT,
      duration TEXT, grade TEXT, student_coordinator TEXT, roll_no TEXT,
      batch_number TEXT, instructor_name TEXT, created_by TEXT REFERENCES admin_users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT
    );
  `);

  const legacyToken = "a".repeat(64);
  db.prepare("INSERT INTO admin_users VALUES (?, ?, ?)").run("admin", "admin@example.test", hash);
  db.prepare("INSERT INTO admin_sessions VALUES (?, ?, ?)").run(
    createHash("sha256").update(legacyToken).digest("hex"),
    "admin", new Date(Date.now() + 120000).toISOString()
  );
  db.exec(readFileSync(new URL("../migrations/0001_certificate_roles.sql", import.meta.url), "utf8"));
  db.prepare("INSERT INTO admin_users VALUES (?, ?, ?, ?)").run(
    "verifier", "verifier@example.test", `verifier-v1:${hash}`, "verifier"
  );

  const env = { TOTP_ENCRYPTION_KEY: "ab".repeat(32), DB: { prepare(sql) {
    const statement = db.prepare(sql);
    const bind = (...args) => ({
      first: async () => statement.get(...args),
      all: async () => ({ results: statement.all(...args) }),
      run: async () => ({ meta: statement.run(...args) })
    });
    return { ...bind(), bind };
  } } };

  const request = (handler, { method = "GET", cookie = "", body, id, path = "/" } = {}) =>
    handler({
      env, params: { id },
      request: new Request(origin + path, {
        method, body: body && JSON.stringify(body),
        headers: { Origin: origin, Cookie: cookie, "CF-Connecting-IP": "192.0.2.1" }
      })
    });

  const adminCookie = `another=1; masscom_session=${legacyToken}`;
  const adminSession = await request(me, { cookie: adminCookie });
  assert.equal((await adminSession.json()).role, "admin");
  assert.equal((await request(list)).status, 401);
  assert.equal((await request(login, {
    method: "POST", body: { email: "admin@example.test", password }
  })).status, 200);

  const secret = new Secret();
  const encrypted = await encryptSecret(secret.base32, env);
  const insertTotp = db.prepare("INSERT INTO admin_totp VALUES (?, ?, 1, -1)");
  insertTotp.run("admin", encrypted);
  insertTotp.run("verifier", encrypted);
  const code = new TOTP({ secret }).generate();
  const adminTotp = await request(totpLogin, {
    method: "POST", body: { email: "admin@example.test", code }
  });
  assert.equal(adminTotp.status, 200);
  const adminTotpCookie = adminTotp.headers.get("Set-Cookie").split(";")[0];
  assert.equal((await (await request(me, { cookie: adminTotpCookie })).json()).role, "admin");
  assert.equal((await request(totpLogin, {
    method: "POST", body: { email: "verifier@example.test", code }
  })).status, 401);

  const verifierLogin = await request(login, {
    method: "POST", body: { email: "verifier@example.test", password }
  });
  assert.equal(verifierLogin.status, 200);
  const cookie = verifierLogin.headers.get("Set-Cookie").split(";")[0];
  assert.equal((await (await request(me, { cookie })).json()).role, "verifier");
  assert.equal((await request(list, { cookie: cookie.replace("v1.", "") })).status, 401);

  const created = await request(create, { method: "POST", cookie, body: {
    certificate_id: "TEST-1", student_name: "Fixture Student", course_name: "Course",
    completion_date: "2026-11-01", qr_code_data: JSON.stringify({ certificateId: "TEST-1" })
  } });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal((await request(list, { cookie })).status, 200);
  assert.equal((await request(edit, {
    method: "PATCH", cookie, id, body: { completion_date: "2026-11-02" }
  })).status, 200);
  assert.equal((await (await request(view, { cookie, id })).json()).data.created_by, "verifier");
  assert.equal((await (await request(verify, { path: "/api/verify?id=TEST-1" })).json()).certificate.completion_date, "2026-11-02");

  for (const handler of [setup, activate, recover]) {
    assert.equal((await request(handler, { method: "POST", cookie })).status, 403);
  }
  assert.equal((await request(remove, { method: "DELETE", cookie, id, body: { password } })).status, 403);
  assert.equal((await request(view, { cookie, id })).status, 200);
  assert.equal((await request(remove, { method: "DELETE", cookie: adminCookie, id })).status, 400);
  assert.equal((await request(remove, {
    method: "DELETE", cookie: adminCookie, id, body: { password }
  })).status, 200);

  db.exec("UPDATE admin_users SET role = 'disabled' WHERE id = 'verifier'");
  assert.equal((await request(list, { cookie })).status, 401);
  assert.equal((await request(login, {
    method: "POST", body: { email: "verifier@example.test", password }
  })).status, 401);
  assert.equal((await request(logout, { method: "POST", cookie })).status, 200);
  db.exec("UPDATE admin_users SET role = 'verifier' WHERE id = 'verifier'");
  assert.equal((await request(list, { cookie })).status, 401);
  db.close();
});
