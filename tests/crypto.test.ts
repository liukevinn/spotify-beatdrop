import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, generateToken, hashToken } from "@/lib/crypto";

describe("crypto", () => {
  it("round-trips encrypt/decrypt", () => {
    const secret = "AQD-refresh-token-123";
    const payload = encrypt(secret);
    expect(payload.split(".")).toHaveLength(3);
    expect(payload).not.toContain(secret);
    expect(decrypt(payload)).toBe(secret);
  });

  it("uses a fresh IV each time", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("detects tampering", () => {
    const [iv, tag, ct] = encrypt("hello world").split(".") as [string, string, string];
    const bytes = Buffer.from(ct, "base64");
    bytes[0] = bytes[0]! ^ 0xff;
    expect(() => decrypt([iv, tag, bytes.toString("base64")].join("."))).toThrow();
  });

  it("fails with the wrong key", () => {
    const payload = encrypt("hello");
    expect(() => decrypt(payload, randomBytes(32))).toThrow();
  });

  it("hashes tokens deterministically", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("generates base64url tokens of 32 bytes", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
