import { z } from "zod";

/** Only the fields DropSet reads. Unknown fields are ignored. */

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const oauthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

export const profileSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable().optional(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    status: z.number().optional(),
    message: z.string().optional(),
    reason: z.string().optional(),
  }),
});

export const trackItemSchema = z.object({
  id: z.string().nullable(),
  uri: z.string(),
  name: z.string(),
  is_local: z.boolean().optional(),
  duration_ms: z.number(),
  artists: z.array(z.object({ name: z.string() })),
  album: z.object({
    images: z.array(z.object({ url: z.string() })).optional(),
  }),
});

export const currentlyPlayingSchema = z.object({
  progress_ms: z.number().nullable().optional(),
  is_playing: z.boolean(),
  currently_playing_type: z.string(),
  // Validated separately with trackItemSchema, since episodes/ads have other shapes.
  item: z.unknown().nullable().optional(),
});

export const devicesSchema = z.object({
  devices: z.array(
    z.object({
      id: z.string().nullable(),
      name: z.string(),
      type: z.string(),
      is_active: z.boolean(),
    }),
  ),
});
