import { describe, expect, it } from "vitest";
import {
  DYNAMIC_TOKEN_LENGTH,
  isDynamicToken,
  mintDynamicToken,
  parseDynamicToken,
  verifyDynamicToken,
} from "@/server/clocking/dynamic-qr";

const ID = "01a13b1c-14d9-7a1b-8237-d2e775e61fcf";
const SECRET = "per-code-secret";
const T0 = Date.UTC(2026, 9, 14, 8, 0, 0);

describe("dynamic QR tokens", () => {
  it("mints a fixed-length url/telegram-safe token that round-trips the code id", () => {
    const { token } = mintDynamicToken(ID, SECRET, 30, T0);
    expect(token).toHaveLength(DYNAMIC_TOKEN_LENGTH);
    expect(token).toMatch(/^[\w-]+$/);
    expect(("q_" + token).length).toBeLessThanOrEqual(64);
    expect(isDynamicToken(token)).toBe(true);
    expect(parseDynamicToken(token)?.codeId).toBe(ID);
  });

  it("does not treat 43-char static tokens as dynamic", () => {
    expect(isDynamicToken("D".padEnd(43, "a"))).toBe(false);
  });

  it("changes every rotation window", () => {
    const a = mintDynamicToken(ID, SECRET, 30, T0).token;
    const b = mintDynamicToken(ID, SECRET, 30, T0 + 30_000).token;
    expect(a).not.toBe(b);
    expect(mintDynamicToken(ID, SECRET, 30, T0 + 29_000).token).toBe(a);
  });

  it("accepts a token within the max age and rejects it after", () => {
    const { token, rotatesAt } = mintDynamicToken(ID, SECRET, 30, T0);
    expect(verifyDynamicToken(token, SECRET, 30, 120, T0)).toBe(true);
    expect(verifyDynamicToken(token, SECRET, 30, 120, rotatesAt + 119_000)).toBe(true);
    expect(verifyDynamicToken(token, SECRET, 30, 120, rotatesAt + 121_000)).toBe(false);
  });

  it("rejects a forged MAC, a wrong secret and windows far in the future", () => {
    const { token } = mintDynamicToken(ID, SECRET, 30, T0);
    const forged = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyDynamicToken(forged, SECRET, 30, 120, T0)).toBe(false);
    expect(verifyDynamicToken(token, "other-secret", 30, 120, T0)).toBe(false);
    const future = mintDynamicToken(ID, SECRET, 30, T0 + 10 * 60_000).token;
    expect(verifyDynamicToken(future, SECRET, 30, 120, T0)).toBe(false);
  });
});
