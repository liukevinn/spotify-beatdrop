import { after } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { json, parseBody, route } from "@/lib/http";
import { performCut, startRest } from "@/lib/services/rest";
import { restSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The cut to the drop song runs after the response, for up to the rest length (spec §11.5). */
export const maxDuration = 300;

export const POST = route(async (req) => {
  const { userId, source } = await requireUser(req, { allowBearer: true });
  const { dropId, restMs } = await parseBody(req, restSchema);
  const { pendingCut, ...result } = await startRest(userId, {
    dropId,
    restMs,
    source: source === "bearer" ? "shortcut" : "pwa",
  });

  if (pendingCut) {
    after(async () => {
      const outcome = await performCut(userId, pendingCut);
      console.info(`[rest] cut for set ${pendingCut.setId}: ${outcome}`);
    });
  }
  return json(result);
});
