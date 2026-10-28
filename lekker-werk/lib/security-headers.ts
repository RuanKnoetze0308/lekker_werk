/**
 * Browser security headers. Static ones go on every response (next.config.ts); the
 * Content-Security-Policy carries a fresh nonce per page request and is set in proxy.ts.
 */

const PAYFAST_ORIGINS = "https://www.payfast.co.za https://sandbox.payfast.co.za";

/**
 * Scripts run only with this request's nonce ('strict-dynamic' lets them load Next's chunks), so
 * injected markup can't execute. Styles allow 'unsafe-inline' because React style props and
 * Next's font CSS are inline; CSS can't run code. Images allow https: for shop product photos.
 */
export function contentSecurityPolicy(nonce: string, opts: { dev: boolean; https: boolean }) {
  const { dev } = opts;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    // Checkout is a browser form POST to PayFast.
    `form-action 'self' ${PAYFAST_ORIGINS}`,
    "frame-ancestors 'none'",
    // Only on https deployments: on http://localhost it would send assets to https and break them.
    ...(opts.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export const STATIC_SECURITY_HEADERS = [
  // Browsers only honour HSTS over https, so this is harmless on localhost.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Full URLs (reset tokens, QR display keys) never leave the site; other sites only see the origin.
  // Not "no-referrer": that makes same-origin POSTs send "Origin: null", which the CSRF check rejects.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];
