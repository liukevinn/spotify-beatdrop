import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { listSets } from "@/lib/db/sets";
import { json, route } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export const GET = route(async (req) => {
  const { userId } = await requireUser(req);
  const { limit } = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json({ sets: await listSets(userId, { limit }) });
});
