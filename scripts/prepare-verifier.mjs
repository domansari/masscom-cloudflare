import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: node scripts/prepare-verifier.mjs <confirmed-email>");
  process.exit(1);
}

const password = randomBytes(32).toString("base64url");
const salt = randomBytes(16);
const derived = pbkdf2Sync(password, salt, 100000, 32, "sha256");
const hash = `verifier-v1:pbkdf2:${salt.toString("hex")}:${derived.toString("hex")}`;
const sqlEmail = email.replaceAll("'", "''");

console.error(`Generated password (share privately): ${password}`);
console.log(
  "INSERT INTO admin_users (id, email, password_hash, role) " +
  `SELECT '${randomUUID()}', '${sqlEmail}', '${hash}', 'verifier' ` +
  `WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE lower(trim(email)) = '${sqlEmail}');`
);
