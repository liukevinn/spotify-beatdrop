import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ERRORS, type ErrorCode } from "@/lib/errors";

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorResponse(code: ErrorCode, message: string, status: number = ERRORS[code].status): NextResponse {
  return json({ error: { code, message } }, status);
}

/** Converts any thrown value into the API error shape. Never leaks internals. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) return errorResponse(err.code, err.message, err.status);
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return errorResponse("VALIDATION", `Invalid request. ${where}${first?.message ?? ""}`.trim());
  }
  console.error("[api] unhandled error", err instanceof Error ? err.message : err);
  return errorResponse("INTERNAL", ERRORS.INTERNAL.message);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler so every failure becomes `{ error: { code, message } }`. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Parses the JSON body (empty body = `{}`) against a zod schema. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const text = await req.text();
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AppError("VALIDATION", "Request body must be JSON.");
    }
  }
  return schema.parse(raw);
}

export const idParamSchema = z.object({ id: z.uuid() });

/** Resolves and validates Next's `{ params }` for `[id]` routes. */
export async function parseIdParam(ctx: { params: Promise<{ id: string }> }): Promise<string> {
  const parsed = idParamSchema.safeParse(await ctx.params);
  if (!parsed.success) throw new AppError("NOT_FOUND");
  return parsed.data.id;
}
