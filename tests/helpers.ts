import { vi } from "vitest";

export interface MockCall {
  url: string;
  method: string;
  body: string | undefined;
  headers: Record<string, string>;
}

type Responder = (call: MockCall) => Response | Promise<Response>;

/**
 * Stubs global fetch with a queue of responders (consumed in order).
 * Returns the recorded calls for assertions.
 */
export function mockFetch(...responders: Responder[]): MockCall[] {
  const calls: MockCall[] = [];
  const queue = [...responders];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const call: MockCall = {
        url: String(input),
        method: init.method ?? "GET",
        body: init.body === undefined ? undefined : String(init.body),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      };
      calls.push(call);
      const next = queue.shift();
      if (!next) throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
      return next(call);
    }),
  );
  return calls;
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

export function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

export function spotifyError(status: number, reason?: string): Response {
  return jsonResponse({ error: { status, message: "error", ...(reason ? { reason } : {}) } }, status);
}
