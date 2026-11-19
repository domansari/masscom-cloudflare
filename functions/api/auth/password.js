const encoder = new TextEncoder();
import { scrypt } from "@noble/hashes/scrypt";
import { hexToBytes } from "@noble/hashes/utils";

export async function verifyVerifierPassword(password, storedHash) {
  // Older deployments cannot authenticate verifier credentials.
  if (!/^verifier-v1:pbkdf2:[a-f0-9]{32}:[a-f0-9]{64}$/.test(storedHash || "")) return false;
  return verifyPassword(password, storedHash.slice("verifier-v1:".length));
}

export async function verifyPassword(password, storedHash) {
  try {
        if (storedHash?.startsWith("pbkdf2:")) {
      const parts = storedHash.split(":");

      if (
        parts.length !== 3 ||
        parts[1].length !== 32 ||
        parts[2].length !== 64
      ) {
        return false;
      }

      return await verifyPBKDF2(password, parts[1], parts[2]);
    }
    const [algorithm, saltHex, expectedHex] = storedHash.split(":");

    if (
      algorithm !== "scrypt" ||
      saltHex.length !== 32 ||
      expectedHex.length !== 128
    ) {
      return false;
    }

    const salt = hexToBytes(saltHex);
    const expected = hexToBytes(expectedHex);

    const actual = scrypt(password, salt, {
      N: 16384,
      r: 8,
      p: 1,
      dkLen: 64
    });

    let difference = 0;

    for (let i = 0; i < expected.length; i++) {
      difference |= actual[i] ^ expected[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
}
export async function verifyPBKDF2(password, saltHex, expectedHex) {
  try {
    const salt = hexToBytes(saltHex);
    const expected = hexToBytes(expectedHex);

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const actual = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations: 100000,
          hash: "SHA-256"
        },
        key,
        expected.length * 8
      )
    );

    let difference = 0;
    for (let i = 0; i < expected.length; i++) {
      difference |= actual[i] ^ expected[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
}
