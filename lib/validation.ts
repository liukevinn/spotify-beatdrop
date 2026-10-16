import { z } from "zod";
import { NUDGE_DELTAS } from "@/lib/logic/drop";

/** Request-body schemas. Ranges mirror the DB check constraints. */

export const LEAD_MS = { min: 5000, max: 60000 } as const;
export const REACTION_OFFSET_MS = { min: 0, max: 600 } as const;
export const AVOID_REPEAT = { min: 0, max: 50 } as const;
export const REST_MS = { min: 30000, max: 300000 } as const;

const leadMs = z.number().int().min(LEAD_MS.min).max(LEAD_MS.max);
const reactionOffsetMs = z.number().int().min(REACTION_OFFSET_MS.min).max(REACTION_OFFSET_MS.max);
const restMs = z.number().int().min(REST_MS.min).max(REST_MS.max);

const restSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("liked") }),
  z.object({
    kind: z.literal("playlist"),
    id: z.string().regex(/^[A-Za-z0-9]{1,64}$/, "Invalid playlist id"),
    name: z.string().trim().min(1).max(200),
  }),
]);

export const nudgeSchema = z.object({
  deltaMs: z.union(NUDGE_DELTAS.map((d) => z.literal(d)), {
    error: `deltaMs must be one of ${NUDGE_DELTAS.join(", ")}`,
  }),
});

export const markSchema = z.object({ reactionOffsetMs: reactionOffsetMs.optional() });

export const cueSchema = z.object({ dropId: z.uuid().optional() });

export const swapSchema = z.object({ dropId: z.uuid() });

export const restSchema = z.object({ dropId: z.uuid().optional(), restMs: restMs.optional() });

export const dropPatchSchema = z
  .object({
    dropMs: z.number().int().min(0).optional(),
    enabled: z.boolean().optional(),
    leadMsOverride: leadMs.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const reorderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(1000) });

export const settingsPatchSchema = z
  .object({
    leadMs: leadMs.optional(),
    reactionOffsetMs: reactionOffsetMs.optional(),
    queueMode: z.enum(["shuffle", "sequential"]).optional(),
    avoidRepeatWithin: z.number().int().min(AVOID_REPEAT.min).max(AVOID_REPEAT.max).optional(),
    restMs: restMs.optional(),
    restSource: restSource.nullable().optional(),
    nextDropId: z.uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const deviceSelectSchema = z.object({
  deviceId: z.string().min(1).max(200),
  deviceName: z.string().min(1).max(200),
});

export const tokenCreateSchema = z.object({ label: z.string().trim().min(1).max(60) });
