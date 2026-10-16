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

/** Minimal track shape for rest fillers (Liked Songs / playlist items). Episodes have type "episode". */
export const fillerTrackSchema = z.object({
  id: z.string().nullable(),
  uri: z.string(),
  type: z.string().optional(),
  is_local: z.boolean().optional(),
  duration_ms: z.number(),
});

export const savedTracksSchema = z.object({
  items: z.array(z.object({ track: z.unknown() })),
});

/** `GET /playlists/{id}/items`. Since Feb 2026 the entry field is `item` (was `track`); accept both. */
export const playlistItemsSchema = z.object({
  items: z.array(z.object({ item: z.unknown().optional(), track: z.unknown().optional() })),
});

export const playlistsSchema = z.object({
  items: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        collaborative: z.boolean().optional(),
        owner: z.object({ id: z.string() }),
        images: z
          .array(z.object({ url: z.string() }))
          .nullable()
          .optional(),
        items: z.object({ total: z.number() }).nullable().optional(),
        tracks: z.object({ total: z.number() }).nullable().optional(),
      })
      .nullable(),
  ),
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
