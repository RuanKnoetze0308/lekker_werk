import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, newBackupCodes, newTotpSecret, normaliseBackupCode, verifyTotp } from "@/server/auth/totp";

// RFC 6238 appendix B (SHA1 seed "12345678901234567890"), 8-digit codes.
const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_VECTORS: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
];

describe("totp", () => {
  it("matches the RFC 6238 test vectors", () => {
    for (const [t, code] of RFC_VECTORS) expect(hotp(RFC_SECRET, Math.floor(t / 30), 8)).toBe(code);
  });

  it("round-trips base32", () => {
    expect(base32Encode(RFC_SECRET)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").equals(RFC_SECRET)).toBe(true);
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });

  it("accepts the current code and one step of drift, nothing further", () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1111111111_000;
    const step = Math.floor(now / 30_000);
    const code = (s: number) => hotp(RFC_SECRET, s);
    expect(verifyTotp(secret, code(step), null, now)).toBe(step);
    expect(verifyTotp(secret, code(step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, code(step + 1), null, now)).toBe(step + 1);
    expect(verifyTotp(secret, code(step - 2), null, now)).toBeNull();
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", null, now)).toBeNull();
  });

  it("refuses a code that was already used", () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1111111111_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, hotp(RFC_SECRET, step), step, now)).toBeNull();
    expect(verifyTotp(secret, hotp(RFC_SECRET, step - 1), step, now)).toBeNull();
  });

  it("makes distinct backup codes", () => {
    const codes = newBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    expect(normaliseBackupCode(" ABCDE-fghij ")).toBe("abcdefghij");
  });
});
