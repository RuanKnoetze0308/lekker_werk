import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Rotating ("dynamic") QR tokens. Nothing is stored per rotation: the token for a time window is
 * HMAC(code secret, code id + window), so any server can mint and check it.
 *
 * Format (47 chars, [A-Za-z0-9_-] only so it fits Telegram's 64-char /start payload after "q_"):
 *   "D" + code id (16 bytes base64url, 22 chars) + window (base36, 8 chars) + MAC (16 chars)
 * Static tokens are 43 chars, so the two can never be confused.
 */
export const DYNAMIC_TOKEN_LENGTH = 47;

export function windowOf(at: number, rotationSeconds: number) {
  return Math.floor(at / 1000 / rotationSeconds);
}

function mac(secret: string, codeId: string, window: number) {
  return createHmac("sha256", secret).update(`${codeId}:${window}`).digest("base64url").slice(0, 16);
}

function idToB64(id: string) {
  return Buffer.from(id.replace(/-/g, ""), "hex").toString("base64url");
}

function b64ToId(s: string) {
  const h = Buffer.from(s, "base64url").toString("hex");
  if (h.length !== 32) return null;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function mintDynamicToken(codeId: string, secret: string, rotationSeconds: number, at = Date.now()) {
  const window = windowOf(at, rotationSeconds);
  return {
    token: `D${idToB64(codeId)}${window.toString(36).padStart(8, "0")}${mac(secret, codeId, window)}`,
    /** When this token stops being the one on screen. */
    rotatesAt: (window + 1) * rotationSeconds * 1000,
  };
}

export function isDynamicToken(token: string) {
  return token.length === DYNAMIC_TOKEN_LENGTH && token.startsWith("D");
}

/** Pulls the code id and window out of a token. The MAC is checked separately by verifyDynamicToken. */
export function parseDynamicToken(token: string) {
  if (!isDynamicToken(token)) return null;
  const codeId = b64ToId(token.slice(1, 23));
  const window = parseInt(token.slice(23, 31), 36);
  if (!codeId || !Number.isFinite(window)) return null;
  return { codeId, window, mac: token.slice(31) };
}

/**
 * True when the MAC matches and the token was on screen no more than `maxAgeSeconds` ago.
 * One window into the future is tolerated for clock skew between servers.
 */
export function verifyDynamicToken(
  token: string,
  secret: string,
  rotationSeconds: number,
  maxAgeSeconds: number,
  at = Date.now(),
) {
  const p = parseDynamicToken(token);
  if (!p) return false;
  const current = windowOf(at, rotationSeconds);
  if (p.window > current + 1) return false;
  // The token was valid until the end of its window; age counts from then.
  const endedAt = (p.window + 1) * rotationSeconds * 1000;
  if (at - endedAt > maxAgeSeconds * 1000) return false;
  const expected = Buffer.from(mac(secret, p.codeId, p.window));
  const actual = Buffer.from(p.mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
