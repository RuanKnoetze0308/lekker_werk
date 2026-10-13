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

/**
 * Keyed hash: exact-match lookups work, but a database leak alone doesn't reveal card numbers
 * or PINs (a plain sha256 of a 4-digit PIN would be reversible in milliseconds).
 * Scoped by company so the same card at two companies doesn't produce the same hash.
 */
export function hashCredential(companyId: string, kind: CredentialKind, raw: string): string {
  return createHmac("sha256", `credential:${env.encryptionKey}`)
    .update(`${companyId}:${kind}:${normaliseCredential(kind, raw)}`)
    .digest("hex");
}

export function credentialHint(kind: CredentialKind, raw: string): string {
  if (kind === "PIN" || kind === "BIOMETRIC_ID") return "";
  return normaliseCredential(kind, raw).slice(-4);
}
