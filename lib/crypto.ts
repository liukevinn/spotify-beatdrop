import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function defaultKey(): Buffer {
  return Buffer.from(env().TOKEN_ENCRYPTION_KEY, "base64");
}

/** AES-256-GCM encrypt. Output format: base64 "iv.tag.ciphertext". */
export function encrypt(plaintext: string, key: Buffer = defaultKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString("base64")).join(".");
}

/** Reverses `encrypt`. Throws if the payload was tampered with or the key is wrong. */
export function decrypt(payload: string, key: Buffer = defaultKey()): string {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Malformed encrypted payload");
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64")) as [Buffer, Buffer, Buffer];
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** SHA-256 hex digest, used to store shortcut tokens at rest. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Random base64url string from `bytes` random bytes. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
