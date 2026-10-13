import "server-only";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { env } from "@/lib/env";
import { AppError } from "../errors";

/** PHP-style urlencode, which is what PayFast signs against (space => +, ~ encoded). */
export function phpUrlencode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, "+");
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

export function processUrl() {
  return `https://${env.payfast.host}/eng/process`;
}

/**
 * Checkout signature: fields in PayFast's documented order, empty values skipped,
 * passphrase appended last. Order matters: the caller passes pairs already in order.
 */
export function signCheckout(pairs: [string, string][]): string {
  const parts = pairs.filter(([, v]) => v !== "").map(([k, v]) => `${k}=${phpUrlencode(v.trim())}`);
  if (env.payfast.passphrase) parts.push(`passphrase=${phpUrlencode(env.payfast.passphrase.trim())}`);
  return md5(parts.join("&"));
}

export interface CheckoutInput {
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  nameFirst: string;
  nameLast: string;
  email: string;
  mPaymentId: string;
  amount: number;
  itemName: string;
  itemDescription: string;
  companyId: string;
  frequency: 3 | 6; // 3 = monthly, 6 = annual
}

export function buildCheckout(i: CheckoutInput): { action: string; fields: [string, string][] } {
  const amount = i.amount.toFixed(2);
  // Order follows PayFast's documented variable order.
  const pairs: [string, string][] = [
    ["merchant_id", env.payfast.merchantId],
    ["merchant_key", env.payfast.merchantKey],
    ["return_url", i.returnUrl],
    ["cancel_url", i.cancelUrl],
    ["notify_url", i.notifyUrl],
    ["name_first", i.nameFirst.slice(0, 100)],
    ["name_last", i.nameLast.slice(0, 100)],
    ["email_address", i.email],
    ["m_payment_id", i.mPaymentId],
    ["amount", amount],
    ["item_name", i.itemName.slice(0, 100)],
    ["item_description", i.itemDescription.slice(0, 255)],
    ["custom_str1", i.companyId],
    ["subscription_type", "1"],
    ["recurring_amount", amount],
    ["frequency", String(i.frequency)],
    ["cycles", "0"],
  ];
  return { action: processUrl(), fields: [...pairs, ["signature", signCheckout(pairs)]] };
}

/** ITN: every posted field except `signature`, in received order, empties kept, passphrase last. */
export function itnParamString(pairs: [string, string][], withPassphrase: boolean): string {
  const parts = pairs.filter(([k]) => k !== "signature").map(([k, v]) => `${k}=${phpUrlencode(v)}`);
  if (withPassphrase && env.payfast.passphrase) parts.push(`passphrase=${phpUrlencode(env.payfast.passphrase.trim())}`);
  return parts.join("&");
}

export function verifyItnSignature(pairs: [string, string][]): boolean {
  const given = pairs.find(([k]) => k === "signature")?.[1] ?? "";
  return given !== "" && md5(itnParamString(pairs, true)) === given.toLowerCase();
}

const PAYFAST_HOSTS = ["www.payfast.co.za", "sandbox.payfast.co.za", "w1w.payfast.co.za", "w2w.payfast.co.za"];

/** ITN must come from PayFast's servers. */
export async function isPayfastIp(ip: string): Promise<boolean> {
  const addrs = new Set<string>();
  for (const h of PAYFAST_HOSTS) {
    for (const a of await lookup(h, { all: true }).catch(() => [])) addrs.add(a.address);
  }
  return addrs.has(ip);
}

/** Ask PayFast to confirm it sent this exact payload. */
export async function validateWithPayfast(pairs: [string, string][]): Promise<boolean> {
  const res = await fetch(`https://${env.payfast.host}/eng/query/validate`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: itnParamString(pairs, false),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.text()).trim() === "VALID";
}

/** PayFast REST API signature: params (headers + body + passphrase) sorted alphabetically. */
function apiSignature(params: Record<string, string>): string {
  const all: Record<string, string> = { ...params, passphrase: env.payfast.passphrase };
  const str = Object.keys(all)
    .filter((k) => all[k] !== "")
    .sort()
    .map((k) => `${k}=${phpUrlencode(all[k].trim())}`)
    .join("&");
  return md5(str);
}

export async function cancelRemoteSubscription(token: string): Promise<void> {
  const timestamp = new Date().toISOString().slice(0, 19);
  const base = { "merchant-id": env.payfast.merchantId, version: "v1", timestamp };
  const res = await fetch(
    `https://api.payfast.co.za/subscriptions/${encodeURIComponent(token)}/cancel${env.payfast.mode === "sandbox" ? "?testing=true" : ""}`,
    {
      method: "PUT",
      headers: { ...base, signature: apiSignature(base) },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new AppError(502, "PAYFAST_ERROR", `PayFast cancel failed (${res.status})`);
}
