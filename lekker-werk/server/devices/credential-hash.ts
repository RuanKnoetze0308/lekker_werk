import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import type { CredentialKind } from "../clocking/types";

/**
 * Readers report the same card in different formats ("04:a2:1f", "04A21F", "04 A2 1F").
 * Normalise before hashing so any reader matches the stored credential.
 */
export function normaliseCredential(kind: CredentialKind, raw: string): string {
  const v = raw.trim();
  if (kind === "PIN") return v.replace(/\D/g, "");
  if (kind === "RFID_CARD" || kind === "NFC_TAG") return v.replace(/[\s:-]/g, "").toUpperCase();
  return v;
}

function hmac(key: string, companyId: string, kind: CredentialKind, raw: string) {
  return createHmac("sha256", key).update(`${companyId}:${kind}:${normaliseCredential(kind, raw)}`).digest("hex");
}

/**
 * Keyed hash: exact-match lookups work, but a database leak alone doesn't reveal card numbers
 * or PINs (a plain sha256 of a 4-digit PIN would be reversible in milliseconds).
 * Scoped by company so the same card at two companies doesn't produce the same hash.
 *
 * Keyed by CREDENTIAL_HASH_KEY when set, so the encryption key can be rotated without
 * re-enrolling every card; otherwise (older installs) by APP_ENCRYPTION_KEY.
 */
export function hashCredential(companyId: string, kind: CredentialKind, raw: string): string {
  const key = env.credentialHashKey;
  return key ? hmac(`credential:v2:${key}`, companyId, kind, raw) : legacyHash(companyId, kind, raw);
}

function legacyHash(companyId: string, kind: CredentialKind, raw: string) {
  return hmac(`credential:${env.encryptionKey}`, companyId, kind, raw);
}

/**
 * Every hash a stored credential may have: the current one first, then the pre-CREDENTIAL_HASH_KEY
 * one. Lookups match either, and identity.ts moves a legacy match to the current hash.
 */
export function credentialHashes(companyId: string, kind: CredentialKind, raw: string): string[] {
  const current = hashCredential(companyId, kind, raw);
  if (!env.credentialHashKey) return [current];
  return [current, legacyHash(companyId, kind, raw)];
}

export function credentialHint(kind: CredentialKind, raw: string): string {
  if (kind === "PIN" || kind === "BIOMETRIC_ID") return "";
  return normaliseCredential(kind, raw).slice(-4);
}
