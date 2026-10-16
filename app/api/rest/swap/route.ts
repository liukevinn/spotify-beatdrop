import { after } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { json, parseBody, route } from "@/lib/http";
import { performCut, swapRest } from "@/lib/services/rest";
import { swapSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The rescheduled cut runs after the response, for up to the rest that's left (spec §11.5). */
export const maxDuration = 300;

export const POST = route(async (req) => {
  const { userId } = await requireUser(req);
  const { dropId } = await parseBody(req, swapSchema);
  const { pendingCut, ...result } = await swapRest(userId, dropId);

  if (pendingCut) {
    after(async () => {
      const outcome = await performCut(userId, pendingCut);
      console.info(`[rest] cut for set ${pendingCut.setId} (swapped): ${outcome}`);
    });
  }
  return json(result);
});
