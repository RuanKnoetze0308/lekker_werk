"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|; )lw_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

/** Thin fetch wrapper: JSON in/out, CSRF header, and normalised errors for forms. */
export async function api<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Server faults (5xx) carry a diagnostic code (docs/ERROR_CODES.md); surface them in dev tools.
    if (res.status >= 500 && json.error) {
      console.error(`[LekkerWerk API] ${options.method ?? (options.body ? "POST" : "GET")} ${url} → ${res.status}`, json.error);
    }
    const fieldErrors: Record<string, string> = {};
    for (const d of (json.error?.details as { path: string; message: string }[] | undefined) ?? []) {
      if (d?.path) fieldErrors[d.path] = d.message;
    }
    throw new ApiError(json.error?.message ?? "Something went wrong.", res.status, fieldErrors);
  }
  return json.data as T;
}
