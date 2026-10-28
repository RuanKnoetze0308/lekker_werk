import "server-only";
import { createHash } from "node:crypto";
import { AppError } from "../errors";

/**
 * Refuses passwords that appear in known data breaches (HaveIBeenPwned "Pwned Passwords").
 * k-anonymity: only the first 5 hex chars of the SHA-1 leave the server; the match happens here.
 * If the service is slow or down we let the password through rather than block signups.
 */
export async function assertPasswordNotBreached(password: string, fetchImpl: typeof fetch = fetch) {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  let body: string;
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "add-padding": "true", "user-agent": "LekkerWerk" },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return;
    body = await res.text();
  } catch {
    return;
  }
  for (const line of body.split("\n")) {
    const [hash, count] = line.trim().split(":");
    // Padding entries have a count of 0.
    if (hash === suffix && Number(count) > 0) {
      throw new AppError(422, "INVALID", "This password has appeared in a data breach. Please choose a different one.", [
        { path: "password", message: "This password has appeared in a data breach. Choose a different one." },
      ]);
    }
  }
}
