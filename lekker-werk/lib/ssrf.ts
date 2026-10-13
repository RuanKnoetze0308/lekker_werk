import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@/server/errors";

function isPrivate(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l === "::";
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Tenants supply integration URLs, so the server must never be tricked into calling internal
 * services. Only public https hosts are allowed.
 */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(422, "INVALID_URL", "Enter a valid URL.");
  }
  if (url.protocol !== "https:") throw new AppError(422, "INVALID_URL", "Only https URLs are allowed.");
  const host = url.hostname;
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) {
    throw new AppError(422, "INVALID_URL", "That address is not allowed.");
  }
  return url;
}
