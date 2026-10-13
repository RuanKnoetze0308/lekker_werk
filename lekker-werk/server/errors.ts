export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const Errors = {
  unauthenticated: () => new AppError(401, "UNAUTHENTICATED", "Please log in."),
  forbidden: (msg = "You do not have access to this resource.") =>
    new AppError(403, "FORBIDDEN", msg),
  notFound: (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found.`),
  conflict: (msg: string) => new AppError(409, "CONFLICT", msg),
  invalid: (msg: string, details?: unknown) => new AppError(422, "INVALID", msg, details),
  rateLimited: () => new AppError(429, "RATE_LIMITED", "Too many requests. Try again shortly."),
};
