import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

let client: SupabaseClient | undefined;

/** Server-only Supabase client using the service role key. Never import from client components. */
export function db(): SupabaseClient {
  if (!client) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

type DbResult<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Throws a generic 500 on a DB error (details go to logs only). */
export function check(result: { error: { message: string; code?: string } | null }, context: string): void {
  if (result.error) {
    console.error(`[db] ${context} failed:`, result.error.code, result.error.message);
    throw new AppError("INTERNAL");
  }
}

/** Data from a query that may legitimately return no row. */
export function unwrapMaybe<T>(result: DbResult<T>, context: string): T | null {
  check(result, context);
  return result.data;
}

/** Data from a query that must return data. */
export function unwrap<T>(result: DbResult<T>, context: string): T {
  const data = unwrapMaybe(result, context);
  if (data === null) {
    console.error(`[db] ${context} returned no data`);
    throw new AppError("INTERNAL");
  }
  return data;
}

export function nowIso(): string {
  return new Date().toISOString();
}
