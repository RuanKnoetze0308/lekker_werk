import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "./lib/security-headers";

/** Pages behind a login. Without a session cookie they go straight to the login modal. */
const PROTECTED = [
  "/dashboard",
  "/employees",
  "/attendance",
  "/schedules",
  "/locations",
  "/qr-codes",
  "/devices",
  "/leave",
  "/exceptions",
  "/payroll",
  "/integrations",
  "/reports",
  "/settings",
  "/billing",
  "/system",
];

// Runs for every page (not API routes or static files):
// 1. Cheap first gate: no session cookie on an app page => login modal. This is NOT the security
//    boundary. Every page and API route re-validates the session and permissions server-side.
// 2. A per-request CSP nonce. Next.js reads it from the request's CSP header and puts it on its
//    own scripts, so only those run.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PROTECTED.some((p) => path === p || path.startsWith(`${p}/`)) && !request.cookies.get("lw_session")) {
    return NextResponse.redirect(new URL("/#login", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === "development",
    https: (process.env.APP_URL ?? "").startsWith("https://"),
  });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  // Lets server layouts know which page is being rendered (used by the billing paywall).
  headers.set("x-pathname", path);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Prefetches included on purpose: they render layouts too, which need x-pathname.
    "/((?!api/|_next/static|_next/image|favicon.ico|images/|.*\\.(?:svg|png|jpg|jpeg|webp|woff2)$).*)",
  ],
};
