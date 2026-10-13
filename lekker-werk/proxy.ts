import { NextResponse, type NextRequest } from "next/server";

// Cheap first gate: no session cookie => send to the login modal. This is NOT the security
// boundary. Every page and API route re-validates the session and permissions server-side.
export function proxy(request: NextRequest) {
  if (!request.cookies.get("lw_session")) {
    return NextResponse.redirect(new URL("/#login", request.url));
  }
  // Lets server layouts know which page is being rendered (used by the billing paywall).
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/employees/:path*",
    "/attendance/:path*",
    "/schedules/:path*",
    "/locations/:path*",
    "/qr-codes/:path*",
    "/devices/:path*",
    "/leave/:path*",
    "/exceptions/:path*",
    "/payroll/:path*",
    "/integrations/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/billing/:path*",
  ],
};
