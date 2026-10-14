import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ZodError, type ZodType } from "zod";
import { AppError, Errors } from "../errors";
import { CSRF_COOKIE, SESSION_COOKIE } from "../auth/session";
import { randomToken, safeEqual } from "@/lib/crypto";
import { diagnose } from "./diagnose";
import { rateLimit } from "../services/rate-limit.service";
import { ConfigError, env } from "@/lib/env";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

function toErrorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID",
          message: "Please check the highlighted fields.",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  // Unexpected: give it a diagnostic code (docs/ERROR_CODES.md) and a ref to find the full
  // error in the server log. The browser never sees SQL, stack traces or secrets.
  const { diagnostic, hint } = diagnose(err);
  const ref = randomToken(6);
  console.error(`[${diagnostic}] ref=${ref} ${err instanceof ConfigError ? "Configuration error" : "Unhandled API error"}`, err);
  const config = err instanceof ConfigError;
  return NextResponse.json(
    {
      error: {
        code: config ? "SERVER_MISCONFIGURED" : "INTERNAL",
        diagnostic,
        ref,
        hint,
        message: `${config ? err.message : "Something went wrong."} (error ${diagnostic}, ref ${ref})`,
      },
    },
    { status: config ? 503 : 500 },
  );
}

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Same-origin check: blocks cross-site form posts even before the CSRF token check. */
function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (no cookie => no CSRF risk)
  if (origin === new URL(env.appUrl).origin) return;
  // Behind a TLS-terminating proxy (Railway, Azure...) the app itself sees plain http and the
  // proxy's internal address, so compare against the host and scheme the browser actually used.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? req.nextUrl.protocol.replace(":", "");
  if (host && origin === `${proto}://${host}`) return;
  throw Errors.forbidden("Bad origin.");
}

interface RouteOptions {
  /** Requests per minute per IP. Default 120. */
  limit?: number;
  /** Mutating requests with a session cookie must echo the CSRF token. Default true. */
  csrf?: boolean;
  rateKey?: string;
}

type Handler<P> = (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>;

export function route<P = Record<string, string>>(
  handler: Handler<P>,
  options: RouteOptions = {},
): Handler<P> {
  return async (req, ctx) => {
    try {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      const key = `${options.rateKey ?? req.nextUrl.pathname}:${clientIp(req)}`;
      if (!(await rateLimit(key, options.limit ?? 120, 60))) throw Errors.rateLimited();

      if (mutating) {
        assertSameOrigin(req);
        if (options.csrf !== false) {
          const jar = await cookies();
          if (jar.get(SESSION_COOKIE)) {
            const cookieToken = jar.get(CSRF_COOKIE)?.value ?? "";
            const headerToken = req.headers.get("x-csrf-token") ?? "";
            if (!cookieToken || !safeEqual(cookieToken, headerToken)) {
              throw Errors.forbidden("Invalid CSRF token.");
            }
          }
        }
      }
      return await handler(req, ctx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw Errors.invalid("Request body must be valid JSON.");
  }
  return schema.parse(json);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

export { clientIp };
