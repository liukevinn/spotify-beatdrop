"use client";

/** Error from a DropSet API route, carrying the server's short, displayable message. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

/** Fetches a same-origin API route. Sends the user to /login when the session is gone. */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("NETWORK", "You're offline. Check your connection.", 0);
  }

  const payload = (await res.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error: { code: string; message: string } }
    | null;

  if (!res.ok) {
    const error = payload && "error" in payload && payload.error ? payload.error : null;
    const code = error?.code ?? "UNKNOWN";
    if (code === "UNAUTHENTICATED") window.location.assign("/login");
    throw new ApiError(code, error?.message ?? "Something went wrong. Try again.", res.status);
  }
  return payload as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}
