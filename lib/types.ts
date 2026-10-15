/** Domain types shared by the API and the UI (camelCase, JSON-safe). */

export type QueueMode = "shuffle" | "sequential";
export type SetSource = "pwa" | "shortcut";

export interface Drop {
  id: string;
  trackId: string;
  trackUri: string;
  trackName: string;
  artists: string;
  albumArtUrl: string | null;
  durationMs: number;
  dropMs: number;
  leadMsOverride: number | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  leadMs: number;
  reactionOffsetMs: number;
  queueMode: QueueMode;
  avoidRepeatWithin: number;
  deviceId: string | null;
  deviceName: string | null;
}

export interface SetRecord {
  id: string;
  dropId: string | null;
  trackId: string;
  trackName: string;
  cuedAt: string;
  positionMs: number;
  leadMs: number;
  source: SetSource;
}

export interface TokenInfo {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

export interface Device {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

/** Track metadata captured from Spotify's currently-playing response. */
export interface TrackInfo {
  id: string;
  uri: string;
  name: string;
  artists: string;
  albumArtUrl: string | null;
  durationMs: number;
}

export type NowPlaying =
  | { playing: false }
  | {
      playing: true;
      track: Omit<TrackInfo, "uri">;
      progressMs: number;
      isPlaying: boolean;
      drop: { id: string; dropMs: number } | null;
    };
