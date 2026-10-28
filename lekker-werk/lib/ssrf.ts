import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { AppError } from "@/server/errors";

/** Addresses a tenant-supplied URL must never reach: loopback, private, link-local, reserved... */
const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23],
  ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(net, bits, "ipv6");

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, "ipv4");
  if (family !== 6) return true;
  // IPv4-mapped (::ffff:10.0.0.1 or ::ffff:a00:1): judge the IPv4 address inside.
  const mapped = /^::ffff:(?:0:)?(.+)$/i.exec(ip)?.[1];
  if (mapped) {
    if (isIP(mapped) === 4) return blocked.check(mapped, "ipv4");
    const m = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(mapped);
    if (m) {
      const n = (parseInt(m[1], 16) << 16) | parseInt(m[2], 16);
      return blocked.check([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."), "ipv4");
    }
    return true;
  }
  return blocked.check(ip, "ipv6");
}

const notAllowed = () => new AppError(422, "INVALID_URL", "That address is not allowed.");

/**
 * Tenants supply integration URLs, so the server must never be tricked into calling internal
 * services. Only public https hosts are allowed. This is the early, friendly check when a URL is
 * saved or used; `publicFetch` checks again at connect time.
 */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(422, "INVALID_URL", "Enter a valid URL.");
  }
  if (url.protocol !== "https:") throw new AppError(422, "INVALID_URL", "Only https URLs are allowed.");
  if (url.username || url.password) throw new AppError(422, "INVALID_URL", "Put credentials in the credential fields, not the URL.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw notAllowed();
  return url;
}

/**
 * DNS lookup used for the actual connection: the address is checked at the moment we connect, so
 * a host that answered with a public address for the check above can't switch to an internal one
 * (DNS rebinding).
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, "", 0);
    const safe = addresses.filter((a) => !isPrivateAddress(a.address));
    if (!safe.length || safe.length !== addresses.length) {
      return callback(Object.assign(new Error("Address not allowed"), { code: "EADDRNOTALLOWED" }), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, safe);
    callback(null, safe[0].address, safe[0].family);
  });
};

export interface PublicResponse {
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
}

/**
 * HTTPS request to a tenant-supplied URL: public addresses only (checked at connect time), no
 * redirects (one could bounce us to an internal address), bounded time and response size.
 */
export async function publicFetch(
  raw: string | URL,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBytes?: number } = {},
): Promise<PublicResponse> {
  const url = await assertPublicHttpsUrl(String(raw));
  const maxBytes = init.maxBytes ?? 10 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: init.method ?? "GET",
        headers: { ...init.headers, ...(init.body ? { "content-length": Buffer.byteLength(init.body) } : {}) },
        lookup: guardedLookup,
        timeout: init.timeoutMs ?? 20_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) req.destroy(new AppError(502, "INTEGRATION_ERROR", "The response was too large."));
          else chunks.push(c);
        });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status,
            // 3xx counts as a failure: redirects are never followed.
            ok: status >= 200 && status < 300,
            json: async () => JSON.parse(text) as unknown,
          });
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new AppError(504, "INTEGRATION_TIMEOUT", "The integration took too long to answer.")));
    req.on("error", (err: NodeJS.ErrnoException) => reject(err.code === "EADDRNOTALLOWED" ? notAllowed() : err));
    if (init.body) req.write(init.body);
    req.end();
  });
}
