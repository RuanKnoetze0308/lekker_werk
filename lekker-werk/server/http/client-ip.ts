import { isIP } from "node:net";

/**
 * The caller's IP address, for rate limits, PayFast's source check and audit trails.
 *
 * X-Forwarded-For is "client, proxy1, proxy2": anything left of what our own proxies added is
 * written by the caller and can be faked. So count `TRUSTED_PROXY_HOPS` entries from the right
 * (default 1: Railway's edge, which either appends the address it saw or replaces the header).
 * Without the header (local dev) the caller is "unknown".
 */
export function clientIpFrom(headers: Pick<Headers, "get">, trustedHops = trustedProxyHops()): string {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = chain.length ? chain[Math.max(0, chain.length - trustedHops)] : "";
  return isIP(ip) ? ip : "unknown";
}

function trustedProxyHops() {
  const n = Number(process.env.TRUSTED_PROXY_HOPS);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
