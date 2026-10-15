import { getSession } from "@/lib/auth/session";
import { json, route } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async () => {
  (await getSession()).destroy();
  return json({ ok: true });
});
