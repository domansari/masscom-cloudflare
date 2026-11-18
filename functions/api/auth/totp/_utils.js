const encoder = new TextEncoder();

export function hex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export function randomSecret() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0, value = 0, result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

function decodeBase32(text) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const output = [];
  let bits = 0, value = 0;
  for (const char of text.toUpperCase().replace(/=+$/, "")) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Invalid secret");
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

async function encryptionKey(env) {
  if (!/^[a-f0-9]{64}$/i.test(env.TOTP_ENCRYPTION_KEY || "")) {
    throw new Error("TOTP encryption key missing");
  }
  const bytes = Uint8Array.from(
    env.TOTP_ENCRYPTION_KEY.match(/../g),
    x => parseInt(x, 16)
  );
  return crypto.subtle.importKey(
    "raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]
  );
}

export async function encryptSecret(secret, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    encoder.encode(secret)
  );
  return hex(iv) + ":" + hex(new Uint8Array(encrypted));
}

export async function decryptSecret(stored, env) {
  const [ivHex, dataHex] = stored.split(":");
  const decode = h => Uint8Array.from(
    h.match(/../g), x => parseInt(x, 16)
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(ivHex) },
    await encryptionKey(env),
    decode(dataHex)
  );
  return new TextDecoder().decode(decrypted);
}

export async function verifyCode(secret, code) {
  if (!/^[0-9]{6}$/.test(code)) return null;

  const key = await crypto.subtle.importKey(
    "raw", decodeBase32(secret),
    { name: "HMAC", hash: "SHA-1" },
    false, ["sign"]
  );

  const current = Math.floor(Date.now() / 30000);

  for (let step = current - 1; step <= current + 1; step++) {
    const counter = new Uint8Array(8);
    new DataView(counter.buffer).setUint32(4, step, false);
    const hmac = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, counter)
    );
    const offset = hmac[hmac.length - 1] & 15;
    const number = (
      ((hmac[offset] & 127) << 24) |
      (hmac[offset + 1] << 16) |
      (hmac[offset + 2] << 8) |
      hmac[offset + 3]
    ) % 1000000;

    if (String(number).padStart(6, "0") === code) return step;
  }

  return null;
}

export function validOrigin(request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

export async function createSession(env, adminId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  const hash = hex(new Uint8Array(digest));
  const expires = new Date(Date.now() + 28800000).toISOString();

  await env.DB.prepare(
    "INSERT INTO admin_sessions (id, admin_id, expires_at) VALUES (?, ?, ?)"
  ).bind(hash, adminId, expires).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie":
        `masscom_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
    }
  });
}
