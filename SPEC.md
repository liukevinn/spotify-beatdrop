# DropSet — Product & Technical Specification

> Working name: **DropSet**. A personal tool that starts a Spotify song a set number of seconds before its beat drop, so a lifter can get set up during the build-up and start the set exactly on the drop.
>
> This document is the source of truth for building v1. It is written for a coding agent working in an empty repo. Read the whole thing before writing code. Section 12 lists hard rules; follow them exactly.

---

## Table of contents

1. Problem
2. Product overview
3. User flows
4. Feature spec (v1)
5. Non-goals for v1
6. Architecture
7. Spotify integration details
8. Data model
9. API specification
10. Frontend specification
11. Core logic (algorithms)
12. Hard rules for the coding agent
13. Environment, setup, and deployment
14. iOS Shortcut setup
15. Milestones and acceptance criteria
16. Testing
17. Error handling and edge cases
18. Future versions (v2+)
19. Open risks

---

## 1. Problem

Lifters who train close to failure often time the beat drop of a song to the start of a hard set for extra energy. The current manual process is:

1. Find the song in Spotify.
2. Scrub through it to roughly 15–40 seconds before the drop.
3. Put the phone down, calm down, get set up.
4. Start the set when the drop hits.

Step 2 is slow, imprecise, and requires fiddling with the phone between sets. The goal is to reduce it to **one tap (or one hardware button press) with the phone locked or in a pocket**.

## 2. Product overview

DropSet stores, for each song the user lifts to, the timestamp of its beat drop. When the user is ready for a set, a single trigger starts the next song at `drop_ms - lead_ms` (default lead: 20 seconds) on the user's phone via Spotify. The user sets the phone down and starts the rep when the drop hits.

Key properties:

- **Personal-scale.** Designed for one user (plus up to ~4 friends). Runs in Spotify Development Mode, which is limited to 5 authorized users per app and requires the app owner to have Spotify Premium.
- **No App Store.** Delivered as a Progressive Web App (PWA) installed to the iPhone home screen, plus an iOS Shortcut bound to the Action button (or Back Tap) for the hands-free trigger.
- **Drop timestamps are tagged manually**, by tapping "Mark drop" while a song plays. No audio analysis in v1. Spotify's audio-analysis and audio-features endpoints are unavailable to apps created after Nov 27, 2024.
- **Spotify does the audio.** DropSet never streams or touches audio; it only sends playback commands through the Spotify Web API (Spotify Connect).

## 3. User flows

### 3.1 First-time setup (once)

1. The user opens the web app URL in Safari and taps **Log in with Spotify**.
2. The user authorizes the app. The app stores their Spotify refresh token (encrypted).
3. In **Settings**, the user:
   - picks their phone from the device list (**Link this phone**),
   - sets the default lead time (default 20 s),
   - creates a **Shortcut token** (shown once) for the iOS Shortcut.
4. The user adds the PWA to the home screen (Share → Add to Home Screen).
5. The user creates the iOS Shortcut (Section 14) and binds it to the Action button or Back Tap.

### 3.2 Tagging drops (ongoing, passive)

1. The user listens to music anywhere (walking, studying).
2. When a drop hits, the user taps **Mark drop** in the PWA, or runs the "Mark drop" Shortcut.
3. The app reads the currently playing track and position, subtracts a reaction offset (default 250 ms), and saves the drop.
4. Re-marking the same track overwrites the previous timestamp.
5. Optionally, the user taps **Test** on a tagged song. It plays from 3 s before the saved drop so they can verify it and nudge by ±0.25 s or ±1 s.

### 3.3 At the gym

1. The user finishes a warm-up, racks the bar, and rests.
2. When ready (typically about 20 s before they want to unrack), the user presses the Action button. The Shortcut calls `POST /api/cue`.
3. The server picks the next tagged song (Section 11.2) and starts it on the linked phone at `drop_ms - lead_ms`.
4. The Shortcut shows a short notification, e.g. `▶ Song Name — drop in 20s`.
5. The user pockets the phone, chalks up, sets up, and unracks during the build-up. The drop hits, and the user starts the first rep.
6. After the set, if the drop felt early or late, the user can open the PWA and tap nudge on the **Last cued** card. This adjusts the saved drop for that track.
7. Repeat for every set.

### 3.4 At the gym with Start rest (v1.1, preferred)

1. Before or between sets, the user optionally picks the song for the next set on Home (**Up next**).
2. The user finishes a set, racks the bar, and presses the Action button (Shortcut → `POST /api/rest`) or taps **Start rest**. The rest length is the Settings default (e.g. 3:30), or the chip selected on Home for this set.
3. The server leaves whatever is playing alone (the last drop song, or anything the user picks in Spotify). Only if nothing is playing does it start backup music from the user's rest source. At `tap + (rest − drop_ms)` it cuts to the drop song from 0:00, so the drop lands when the rest ends (Section 11.5). Music plays throughout, so the phone stays reachable via Spotify Connect while locked.
4. The notification reads `⏱ 3:30 rest → Song Name`. Home shows a live countdown.
5. The drop hits as the rest ends; the user starts the first rep. Up next resets to auto.

## 4. Feature spec (v1)

| # | Feature | Description |
|---|---|---|
| F1 | Spotify login | OAuth Authorization Code flow; session cookie; logout |
| F2 | Now playing card | Shows current track, art, progress, and whether it's tagged; polls every 2 s while visible |
| F3 | Mark drop | Saves `progress_ms - reaction_offset_ms` for the current track; available from the PWA and via bearer token (Shortcut) |
| F4 | Library | List of tagged songs: name, artist, art, drop time (m:ss.s), enabled toggle, per-track lead override, reorder, delete |
| F5 | Test drop | Plays the track from `drop_ms - 3000` on the linked device |
| F6 | Nudge | ±250 ms / ±1000 ms adjustments to a track's `drop_ms`; on library rows and on the Last cued card |
| F7 | Cue next set | Picks the next track and plays it at `drop_ms - lead`; available from a big button in the PWA and via bearer token (Shortcut) |
| F8 | Device linking | Lists Spotify devices; user selects their phone; stored `device_id` with fallback logic |
| F9 | Settings | Lead time (5–60 s, default 20), reaction offset (0–600 ms, default 250), queue mode (shuffle/sequential), repeat-avoidance window (default 5 sets) |
| F10 | Shortcut tokens | Create (shown once), list, revoke; hashed at rest |
| F11 | Set history | Log of every cue (time, track, position, lead); simple list page |
| F12 | PWA | Manifest, icons, standalone display, iOS meta tags, mobile-first UI |
| F13 | Start rest (v1.1) | Plays rest music now so the chosen drop hits exactly `rest` from the tap (Section 11.5); PWA and bearer token (Shortcut) |
| F14 | Up next (v1.1) | Pick the drop for the next set on Home; stored server-side so the Shortcut uses it; one-shot (cleared once used) |
| F15 | Rest settings (v1.1) | Default rest (0:30–5:00, default 3:30), per-set rest chips on Home, rest music source (Liked Songs, an owned/collaborative playlist, or the other tagged songs) |

## 5. Non-goals for v1

Do **not** build any of the following in v1:

- External schedulers (QStash, cron, queues). The v1.1 rest cut (F13) waits inside the `/api/rest` invocation via `after()`, which is why rests are capped at 5:00 (Vercel Hobby's 300 s function limit). See Section 18.
- Push notifications or service-worker push.
- Automatic drop detection or any audio analysis.
- Shared/crowdsourced drop database across users.
- Playlist import from Spotify. Tracks enter the library only by tagging them while they play. (Rest sources only *read* a playlist as filler; they don't add drops.)
- A native iOS or Android app.
- Apple Music or any non-Spotify service.

## 6. Architecture

```
┌──────────────────────┐        ┌───────────────────────────────┐
│ iPhone               │        │ Vercel (Next.js App Router)   │
│                      │        │                               │
│  PWA (home screen) ──┼─HTTPS──▶  Pages (React, Tailwind)      │
│                      │        │  Route handlers /api/*        │
│  iOS Shortcut ───────┼─HTTPS──▶   - auth (Spotify OAuth)      │
│  (Action button)     │ Bearer │   - drops, cue, settings…     │
│                      │        │   - spotify client wrapper ───┼──▶ api.spotify.com
│  Spotify app ◀───────┼────────┼── (Spotify Connect playback)  │     accounts.spotify.com
└──────────────────────┘        │                               │
                                │  supabase-js (service role) ──┼──▶ Supabase Postgres
                                └───────────────────────────────┘
```

### 6.1 Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript (strict) | Route handlers under `app/api/**/route.ts` |
| Styling | Tailwind CSS | Mobile-first, dark theme default |
| Validation | zod | Validate every request body and every Spotify response shape used |
| Database | Supabase Postgres | Used **only as a database**, accessed server-side with the service role key. Do not use Supabase Auth |
| DB access | `@supabase/supabase-js` (server only) | Put all queries in `lib/db/*` |
| Sessions | Signed, httpOnly cookie via `iron-session` | Holds `userId` only |
| Crypto | Node `crypto` (AES-256-GCM, SHA-256) | Refresh-token encryption; shortcut-token hashing |
| Tests | Vitest | Unit tests for pure logic and the Spotify client with mocked `fetch` |
| Hosting | Vercel | Node runtime for all API routes (not Edge) |

### 6.2 Repository layout

```
/
├─ app/
│  ├─ layout.tsx                 # PWA meta tags, theme
│  ├─ page.tsx                   # Home: now playing, Mark drop, Cue, Last cued
│  ├─ login/page.tsx
│  ├─ library/page.tsx
│  ├─ history/page.tsx
│  ├─ settings/page.tsx
│  ├─ manifest.ts                # Next.js metadata route for the web manifest
│  └─ api/
│     ├─ auth/login/route.ts
│     ├─ auth/callback/route.ts
│     ├─ auth/logout/route.ts
│     ├─ me/route.ts
│     ├─ player/now/route.ts
│     ├─ devices/route.ts
│     ├─ devices/select/route.ts
│     ├─ drops/route.ts                 # GET list
│     ├─ drops/mark/route.ts            # POST
│     ├─ drops/[id]/route.ts            # PATCH, DELETE
│     ├─ drops/[id]/nudge/route.ts      # POST
│     ├─ drops/[id]/test/route.ts       # POST
│     ├─ drops/reorder/route.ts         # POST
│     ├─ cue/route.ts                   # POST
│     ├─ cue/nudge-last/route.ts        # POST
│     ├─ settings/route.ts              # GET, PATCH
│     ├─ tokens/route.ts                # GET, POST
│     ├─ tokens/[id]/route.ts           # DELETE
│     └─ sets/route.ts                  # GET
├─ components/                   # UI components
├─ lib/
│  ├─ auth/session.ts            # iron-session config + getSessionUser()
│  ├─ auth/requireUser.ts        # resolves user from cookie OR bearer token
│  ├─ crypto.ts                  # encrypt/decrypt, hashToken, generateToken
│  ├─ spotify/oauth.ts           # authorize URL, code exchange, refresh
│  ├─ spotify/client.ts          # getValidAccessToken(), spotifyFetch(), typed calls
│  ├─ spotify/types.ts           # zod schemas for responses we use
│  ├─ db/client.ts               # supabase service-role client (server only)
│  ├─ db/users.ts, drops.ts, settings.ts, sets.ts, tokens.ts
│  ├─ logic/position.ts          # computeStartPosition()
│  ├─ logic/queue.ts             # selectNextDrop()
│  ├─ logic/format.ts            # ms → "m:ss.s"
│  └─ errors.ts                  # AppError + error codes
├─ supabase/migrations/0001_init.sql
├─ public/icons/                 # 192, 512, apple-touch-icon 180
├─ tests/                        # vitest
├─ .env.example
└─ README.md
```

## 7. Spotify integration details

### 7.1 App registration (manual, done by the user)

1. Go to the Spotify Developer Dashboard and create an app.
2. Enable the **Web API**.
3. Add redirect URIs:
   - Local: `http://127.0.0.1:3000/api/auth/callback`. Spotify does not accept `localhost`; use the loopback IP.
   - Prod: `https://<your-app>.vercel.app/api/auth/callback`
4. Under **User Management**, add the Spotify account email of every user (max 5 in Development Mode).
5. Copy the Client ID and Client Secret into env vars.

### 7.2 OAuth

Use the **Authorization Code flow with client secret**. The app has a server, so it is a confidential client.

- Authorize: `GET https://accounts.spotify.com/authorize` with `client_id`, `response_type=code`, `redirect_uri`, `scope`, `state`.
- `state`: random 32-byte value, stored in a short-lived httpOnly cookie, verified in the callback.
- Token exchange / refresh: `POST https://accounts.spotify.com/api/token`, `Content-Type: application/x-www-form-urlencoded`, `Authorization: Basic base64(client_id:client_secret)`.
  - Exchange body: `grant_type=authorization_code&code=...&redirect_uri=...`
  - Refresh body: `grant_type=refresh_token&refresh_token=...`
- **Scopes (exactly these):**
  - `user-read-playback-state`
  - `user-modify-playback-state`
  - `user-read-currently-playing`
  - `user-library-read` (v1.1: Liked Songs as rest source)
  - `playlist-read-private`, `playlist-read-collaborative` (v1.1: playlists as rest source)
- Store the granted `scope` string from the token response in `users.scopes` (at login and on refresh when present). Users who logged in before v1.1 lack the rest scopes; rest-source features return 403 `PLAYLIST_ACCESS_REQUIRED` and the UI offers "Grant playlist access" (= log in again).
- After the exchange, call `GET /v1/me` to get the Spotify user `id` and `display_name`. Upsert the `users` row keyed by `spotify_user_id`.
- Access tokens last ~1 hour. `getValidAccessToken(userId)` must:
  1. return the cached `access_token` if it expires more than 60 s from now;
  2. otherwise refresh;
  3. if the refresh response includes a new `refresh_token`, encrypt and store it (rotation);
  4. on `invalid_grant`, set `needs_reauth = true` and throw `AppError('REAUTH_REQUIRED')`.
- Guard concurrent refreshes per user in-process (a simple promise map is enough for this scale).

### 7.3 Web API endpoints used (the only ones)

Base: `https://api.spotify.com/v1`

| Purpose | Request | Notes |
|---|---|---|
| Profile | `GET /me` | At login only |
| Current track | `GET /me/player/currently-playing` | **204 = nothing playing.** Use `item.id`, `item.uri`, `item.name`, `item.artists[].name`, `item.album.images[0].url`, `item.duration_ms`, `progress_ms`, `is_playing`, `currently_playing_type` |
| Devices | `GET /me/player/devices` | `devices[]`: `id`, `name`, `type` (e.g. `Smartphone`), `is_active` |
| Transfer playback | `PUT /me/player` body `{ "device_ids": [id], "play": false }` | Used only in the fallback path |
| Play at position | `PUT /me/player/play?device_id={id}` body `{ "uris": ["spotify:track:ID"], "position_ms": N }` | Success = 202 or 204. For a rest queue, `uris` has several tracks and the body adds `"offset": { "position": 0 }` |
| Shuffle off (v1.1) | `PUT /me/player/shuffle?state=false&device_id={id}` | Before and after a rest queue starts. Best effort |
| Repeat off (v1.1) | `PUT /me/player/repeat?state=off&device_id={id}` | Same; repeat-one would loop the filler |
| Liked Songs (v1.1) | `GET /me/tracks?limit=50&offset=0,50` | 100 most recent likes; `items[].track` |
| Playlist items (v1.1) | `GET /playlists/{id}/items?limit=50&offset=0,50` | Renamed from `/tracks` in Feb 2026; entries are `items[].item` (accept legacy `track`). **Only returns items for playlists the user owns or collaborates on** |
| My playlists (v1.1) | `GET /me/playlists?limit=50` | Filter to `owner.id == spotify_user_id` or `collaborative` |

Store track metadata (name, artists, art, duration) **at tag time** from the currently-playing response, so the app never needs track-lookup endpoints.

### 7.4 Spotify error handling

| Status / reason | Meaning | Handling |
|---|---|---|
| 401 | Token expired or invalid | Refresh once and retry once |
| 403 `PREMIUM_REQUIRED` | Account isn't Premium | `AppError('PREMIUM_REQUIRED')` |
| 403 (other) | User not added in the dashboard or missing scope | `AppError('SPOTIFY_FORBIDDEN')` with a hint to check User Management |
| 404 `NO_ACTIVE_DEVICE` / device not found | Phone not reachable | Device fallback (Section 11.4) |
| 429 | Rate limited | Read `Retry-After`; retry once if ≤ 2 s, else fail with `RATE_LIMITED` |
| 5xx | Spotify outage | Retry once after 300 ms, then fail |

## 8. Data model

Migration file: `supabase/migrations/0001_init.sql`.

```sql
create extension if not exists pgcrypto;

create table users (
  id                       uuid primary key default gen_random_uuid(),
  spotify_user_id          text not null unique,
  display_name             text,
  refresh_token_enc        text not null,          -- AES-256-GCM, base64 "iv.tag.ciphertext"
  access_token             text,                    -- short-lived; stored plain for caching
  access_token_expires_at  timestamptz,
  needs_reauth             boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table settings (
  user_id              uuid primary key references users(id) on delete cascade,
  lead_ms              integer not null default 20000 check (lead_ms between 5000 and 60000),
  reaction_offset_ms   integer not null default 250   check (reaction_offset_ms between 0 and 600),
  queue_mode           text    not null default 'shuffle' check (queue_mode in ('shuffle','sequential')),
  avoid_repeat_within  integer not null default 5 check (avoid_repeat_within between 0 and 50),
  device_id            text,
  device_name          text,
  updated_at           timestamptz not null default now()
);

create table drops (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  track_id          text not null,
  track_uri         text not null,
  track_name        text not null,
  artists           text not null,                 -- comma-joined display string
  album_art_url     text,
  duration_ms       integer not null,
  drop_ms           integer not null check (drop_ms >= 0),
  lead_ms_override  integer check (lead_ms_override between 5000 and 60000),
  enabled           boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, track_id)
);
create index drops_user_idx on drops(user_id);

create table sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  drop_id      uuid references drops(id) on delete set null,
  track_id     text not null,
  track_name   text not null,
  cued_at      timestamptz not null default now(),
  position_ms  integer not null,
  lead_ms      integer not null,
  source       text not null check (source in ('pwa','shortcut'))
);
create index sets_user_cued_idx on sets(user_id, cued_at desc);

create table api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  label         text not null,
  token_hash    text not null unique,              -- sha256 hex of the raw token
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

-- Server-only access via service role. Enable RLS with no policies so the anon key can read nothing.
alter table users      enable row level security;
alter table settings   enable row level security;
alter table drops      enable row level security;
alter table sets       enable row level security;
alter table api_tokens enable row level security;
```

Rules:

- Every DB query must be scoped by `user_id`. Never trust an id from the client without checking ownership.
- Update `updated_at` in application code on every update.
- When a new user is created, insert a default `settings` row in the same request.

**Migration `supabase/migrations/0002_rest_segue.sql` (v1.1, additive):**

```sql
alter table users add column scopes text;

alter table settings
  add column rest_ms           integer not null default 210000 check (rest_ms between 30000 and 300000),
  add column rest_source       text,   -- 'liked' or a Spotify playlist id; NULL = the other tagged songs
  add column rest_source_name  text,
  add column next_drop_id      uuid references drops(id) on delete set null;
```

A rest is logged as a normal `sets` row with `lead_ms = rest` and `position_ms` = where the drop song itself started (0 when fillers led into it).
- New drops get `sort_order = max(sort_order) + 1` for that user.

## 9. API specification

All routes are JSON in and JSON out. Error shape:

```json
{ "error": { "code": "NO_DEVICE", "message": "Open Spotify on your phone and try again." } }
```

`message` is always a short, human-readable sentence, because the iOS Shortcut displays it directly.

### 9.1 Authentication of requests

`requireUser(req)` resolves the user in this order:

1. `Authorization: Bearer <token>` → `sha256(token)` lookup in `api_tokens` where `revoked_at is null` → update `last_used_at`.
2. Otherwise, the iron-session cookie.
3. Otherwise → 401 `UNAUTHENTICATED`.

**Bearer tokens are accepted only on:** `POST /api/cue`, `POST /api/drops/mark`, `POST /api/cue/nudge-last`. Every other route is cookie-only.

If `users.needs_reauth` is true → 401 `REAUTH_REQUIRED`, message `"Log in to DropSet again."`

### 9.2 Routes

**Auth**

- `GET /api/auth/login` → 302 to the Spotify authorize URL; sets the `state` cookie.
- `GET /api/auth/callback?code&state` → verifies state, exchanges code, upserts user and default settings, sets session → 302 to `/`. On error → 302 to `/login?error=<code>`.
- `POST /api/auth/logout` → destroys session → `{ ok: true }`.
- `GET /api/me` → `{ displayName, needsReauth, deviceLinked: boolean, playlistAccess: boolean }`.

**Player**

- `GET /api/player/now` →
  ```json
  { "playing": true, "track": { "id", "name", "artists", "albumArtUrl", "durationMs" },
    "progressMs": 83412, "isPlaying": true, "drop": { "id", "dropMs" } | null }
  ```
  If Spotify returns 204, or `currently_playing_type !== 'track'` → `{ "playing": false }`.

**Devices**

- `GET /api/devices` → `{ devices: [{ id, name, type, isActive }], linkedDeviceId }`.
- `POST /api/devices/select` body `{ deviceId, deviceName }` → saves to settings.

**Drops**

- `GET /api/drops` → `{ drops: Drop[] }` ordered by `sort_order`.
- `POST /api/drops/mark` body `{}` (optional `{ reactionOffsetMs }`) →
  - reads currently-playing; if nothing is playing or it's not a track → 409 `NOTHING_PLAYING`, message `"Nothing is playing on Spotify."`
  - `drop_ms = max(0, progress_ms - reaction_offset_ms)`
  - upserts on `(user_id, track_id)`, refreshing metadata
  - response: `{ drop, created: boolean, message: "Marked drop for <name> at 1:23.4" }`
- `PATCH /api/drops/:id` body any of `{ dropMs, enabled, leadMsOverride (number|null) }` → `{ drop }`.
- `DELETE /api/drops/:id` → `{ ok: true }`.
- `POST /api/drops/:id/nudge` body `{ deltaMs }`, where `deltaMs` ∈ {-1000, -250, 250, 1000} → clamps to `[0, duration_ms - 1]` → `{ drop }`.
- `POST /api/drops/:id/test` → plays from `max(0, drop_ms - 3000)` on the linked device (Section 11.4 fallback applies). Does **not** log a set → `{ ok: true }`.
- `POST /api/drops/reorder` body `{ ids: string[] }` → rewrites `sort_order` in the given order.

**Cue**

- `POST /api/cue` body `{}` (optional `{ dropId }` to force a specific track) →
  1. `selectNextDrop()` (Section 11.2). No enabled drops → 409 `NO_DROPS`, message `"Tag some drops first."`
  2. `position = computeStartPosition()` (Section 11.1).
  3. `playOnDevice()` (Section 11.4).
  4. Insert a `sets` row (`source` = `shortcut` if bearer-authenticated, else `pwa`).
  5. Response:
     ```json
     { "ok": true, "set": { ... }, "track": { "name", "artists" },
       "leadMs": 20000, "message": "▶ Song Name — drop in 20s" }
     ```
- The forced track is `dropId` if given, else the settings' `nextDropId` (Up next). When Up next was used, it is cleared after the set is logged.
- `POST /api/rest` (v1.1, bearer allowed) body `{}` (optional `{ dropId, restMs }`, `restMs` 30000–300000; default = settings `restMs`) →
  1. Pick the drop exactly like `/api/cue`, including Up next.
  2. `restMs - drop_ms > 285000` → 409 `REST_TOO_LONG`. If `restMs > drop_ms`, load fillers (Section 11.5); none usable → 409 `NO_FILLER`. A rest source without the scopes → 403 `PLAYLIST_ACCESS_REQUIRED`.
  3. `planRest()`, start rest music (or the drop song directly), log a `sets` row with `cued_at` = the tap time, clear Up next if used.
  4. Respond: `{ "ok": true, "set", "track": { "name", "artists" }, "restMs": 210000, "dropAt": "<ISO>", "message": "⏱ 3:30 rest → Song Name" }`.
  5. After responding (`after()`, `maxDuration = 300`): `performCut()` (Section 11.5).
- `POST /api/rest/swap` (v1.1, session only) body `{ dropId }` → changes the running rest's drop song, keeping the same drop moment (`cuedAt + leadMs`). No rest with ≥ 1 s left → 409 `NO_ACTIVE_REST`. Updates the set's drop/track; reschedules the cut via `after()` (Section 11.5). Response `{ ok, set, track, dropAt, message: "⇄ Song — drop in m:ss" }`.
- `GET /api/playlists` (v1.1) → `{ playlists: [{ id, name, trackCount, imageUrl }] }`, owned/collaborative only; 403 `PLAYLIST_ACCESS_REQUIRED` without the scopes.
- `POST /api/cue/nudge-last` body `{ deltaMs }` → applies a nudge to the drop of the user's most recent `sets` row → `{ drop, message: "Adjusted <name> to 1:23.9" }`.

**Settings / tokens / history**

- `GET /api/settings` → settings object.
- `PATCH /api/settings` body any of `{ leadMs, reactionOffsetMs, queueMode, avoidRepeatWithin, restMs, restSource, nextDropId }` → validated with the same ranges as the DB checks. `restSource` is `null`, `{ kind: "liked" }`, or `{ kind: "playlist", id, name }`. `nextDropId` must belong to the user (else 404).
- `GET /api/tokens` → `{ tokens: [{ id, label, createdAt, lastUsedAt, revoked }] }` (never returns the raw token or hash).
- `POST /api/tokens` body `{ label }` → generates 32 random bytes as base64url, stores the sha256 hash → `{ id, token }` (**raw token returned only this once**).
- `DELETE /api/tokens/:id` → sets `revoked_at`.
- `GET /api/sets?limit=50` → recent sets, newest first.

## 10. Frontend specification

Mobile-first, one-handed use, dark theme, large touch targets (min 48 px). No external UI kit required.

### 10.1 Global

- `app/layout.tsx` metadata:
  - `manifest` via `app/manifest.ts`: `name: "DropSet"`, `short_name: "DropSet"`, `display: "standalone"`, `start_url: "/"`, `background_color` and `theme_color` dark, icons 192/512.
  - `appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "DropSet" }`
  - `apple-touch-icon` 180×180.
  - Viewport: `width=device-width, initial-scale=1, viewport-fit=cover`; respect `env(safe-area-inset-*)`.
- Bottom tab bar: **Home**, **Library**, **History**, **Settings**.
- Unauthenticated users → redirect to `/login`. If `needsReauth` → a banner with a re-login button.
- A service worker is **not required** in v1.

### 10.2 Home (`/`)

Top to bottom:

1. **Now playing card.** Polls `GET /api/player/now` every 2 s while `document.visibilityState === 'visible'`; stops when hidden. Shows art, name, artists, progress bar, and a "Tagged at 1:23.4" badge if tagged.
2. **Mark drop** button. Large and primary while something is playing. Calls `POST /api/drops/mark`. Show a toast with `message`. Trigger haptic feedback via `navigator.vibrate` where supported (it no-ops on iOS; that's fine).
3. **Up next card** (v1.1). The song that drops next. **During a rest** (until 3 s before its drop) it shows the rest's drop song, and picking another calls `POST /api/rest/swap`: same drop moment, starting partway in if the new build-up no longer fits; no Auto option. **Otherwise** it shows the chosen drop or "Auto · Shuffle/In order", and a pick (or Auto) saves `nextDropId` via `PATCH /api/settings`.
4. **Rest chips** (v1.1). 1:30, 2:00, 2:30, 3:00, 3:30, 4:00, 5:00 plus the default (marked). Choice applies to the next rest only; starts at the default.
5. **Start rest** button. Very large, the most prominent element. Calls `POST /api/rest` with the selected `restMs` and shows a toast with `message`.
6. **Start in Ns** button (the v1 cue, now secondary). Calls `POST /api/cue`.
7. **Countdown** (v1.1). While a set's drop is still ahead (`cuedAt + leadMs`), the Now playing card is replaced by a live "Drop in m:ss" countdown, then "Drop!" for a few seconds. Changing the rest's song is done from the Up next card.
8. **Last set card.** Most recent set: track name, time ago, rest/lead, and "The drop came…" buttons `1s early  ¼s early  ¼s late  1s late` (calls `POST /api/cue/nudge-last`).
9. If no device is linked, a warning links to Settings. If a rest source is set but `playlistAccess` is false, a warning links to Settings.

### 10.3 Library (`/library`)

- A list of drops ordered by `sort_order`. Each row shows art, name, artists, drop time `m:ss.s`, and an enabled toggle.
- Tapping a row expands it: **Test**, "The drop came…" nudge buttons, lead override (select: Default, 10, 15, 20, 25, 30, 40 s), **Delete** (with confirm).
- **Nudge labels (v1.1).** Buttons say what the user heard: `1s early`, `¼s early`, `¼s late`, `1s late` (deltas −1000, −250, +250, +1000 on `drop_ms`). "Early" means the drop arrived before the countdown hit 0, or sooner than Test's 3 s. Same meaning on the Last set card.
- Reorder with up/down buttons (drag-and-drop optional). Persist via `/api/drops/reorder`.
- Empty state: "Play a song on Spotify and tap Mark drop when it hits."

### 10.4 History (`/history`)

- Recent sets grouped by day: time, track, lead used.

### 10.5 Settings (`/settings`)

- **Device:** a list from `GET /api/devices` with a refresh button; tap to link. Show the linked device name. Helper text: "Open Spotify on your phone first so it appears here."
- **Default rest** (v1.1): slider 0:30–5:00, step 15 s.
- **Lead time:** slider 5–60 s, step 1 s (used by "Start in Ns").
- **Reaction offset:** slider 0–600 ms, step 25.
- **Queue mode:** Shuffle / Sequential.
- **Avoid repeats within:** stepper 0–20 sets.
- **Backup music** (v1.1): played only when nothing is playing at Start rest, and queued behind drop songs. Liked Songs, the user's own/collaborative playlists (`GET /api/playlists`), or "My other drop songs". Collapsed to the current choice with a Change button. Without the scopes, show "Grant playlist access" → `/api/auth/login`.
- **Shortcut tokens:** create (label input) → modal showing the token once with a copy button and the Shortcut instructions (Section 14); list with revoke.
- **Log out.**

## 11. Core logic (algorithms)

Implement these as pure functions in `lib/logic/*` with unit tests.

### 11.1 Start position

```ts
function computeStartPosition(drop: { dropMs: number; durationMs: number; leadMsOverride: number | null },
                              settings: { leadMs: number }): { positionMs: number; leadMs: number } {
  const leadMs = drop.leadMsOverride ?? settings.leadMs;
  const raw = drop.dropMs - leadMs;
  const positionMs = Math.min(Math.max(0, raw), Math.max(0, drop.durationMs - 1000));
  // If raw < 0, the actual lead is shorter than requested; report the real lead.
  return { positionMs, leadMs: drop.dropMs - positionMs };
}
```

The `message` must use the **actual** lead (e.g. a drop at 0:12 with a 20 s lead gives "drop in 12s").

### 11.2 Next-drop selection

Inputs: the user's enabled drops (ordered by `sort_order`), recent sets, settings.

```
if forced dropId provided and it belongs to user and is enabled → return it

candidates = enabled drops
if candidates empty → throw NO_DROPS

recent = sets for user where cued_at > now() - 4 hours, newest first, limit avoid_repeat_within
excluded = set(recent.track_id)
pool = candidates.filter(d => !excluded.has(d.track_id))
if pool empty → pool = candidates.filter(d => d.track_id !== recent[0]?.track_id)
if pool empty → pool = candidates          // only one song tagged

if queue_mode == 'shuffle':
    return uniform random element of pool
else ('sequential'):
    last = most recent set (any time)
    lastIdx = index in candidates of drop with last.track_id (−1 if none)
    walk candidates starting at lastIdx+1 (wrapping); return first that is in pool
```

Make the random source injectable so it can be tested.

### 11.3 Mark drop

```
now = GET /me/player/currently-playing
if 204 or currently_playing_type != 'track' or item null → NOTHING_PLAYING
offset = body.reactionOffsetMs ?? settings.reaction_offset_ms
dropMs = max(0, now.progress_ms - offset)
upsert drops (user_id, track_id=item.id) set track_uri=item.uri, track_name, artists, album_art_url,
       duration_ms, drop_ms=dropMs, updated_at=now()
```

Use `item.id` / `item.uri` as returned (if `item.linked_from` exists, still use `item.id`; the returned URI is playable).

### 11.4 Play on device (with fallback)

```
async function playOnDevice(userId, trackUri, positionMs):
  settings = load settings
  deviceId = settings.device_id

  if deviceId is null:
      deviceId = await pickFallbackDevice()          // see below
      if null → throw NO_DEVICE

  res = PUT /me/player/play?device_id=deviceId  { uris:[trackUri], position_ms: positionMs }
  if ok → return

  if res is 404 (device not found / no active device):
      devices = GET /me/player/devices
      target = devices.find(id == settings.device_id)
            ?? devices.find(type == 'Smartphone' && name == settings.device_name)
            ?? devices.find(type == 'Smartphone')
      if !target → throw NO_DEVICE   // message: "Open Spotify on your phone and try again."
      if target.id != settings.device_id → update settings.device_id / device_name
      PUT /me/player { device_ids:[target.id], play:false }
      wait 300 ms
      retry PUT /me/player/play once with target.id; if it fails → throw NO_DEVICE
```

`pickFallbackDevice()`: the first `Smartphone` device from `/me/player/devices`, else the active device, else null.

### 11.5 Start rest (v1.1)

Goal: the drop lands exactly `rest` ms after the tap. During the rest DropSet leaves the user's music alone (they can play anything); at the cut it switches to the drop song at 0:00.

```
tappedAt = now
playing = currently-playing is a playing track or a local file (errors → false)
cut = rest - drop_ms
if cut > 285 s → REST_TOO_LONG                                       // must fit one 300 s function run

fillers ("backup music") = rest-source tracks (100 most recent likes, or the first 100 playlist items)
          minus local files, episodes, tracks < 30 s, the drop itself,
          and every tagged drop (so drops aren't spoiled)
          if that leaves nothing → the other enabled drops
          (no rest source set → the other enabled drops)
          loading is required (errors surface, e.g. PLAYLIST_ACCESS_REQUIRED) only when
          !playing and cut > 0; otherwise best effort, falling back to the other drops
after = random fillers until sum(duration − 12 s) ≥ 12 min           // queued behind every drop song

if cut <= 0: play [drop, ...after] with drop at (drop_ms - rest) + (now - tappedAt); done
if playing:  start nothing                                           // keep the user's music
else:        fillers empty → NO_FILLER
             play random fillers from 0:00 until sum(duration − 12 s) ≥ rest + 12 s
             // outlasts the whole rest even if Spotify's crossfade (≤ 12 s) shortens every
             // hand-off, so a swap can move the cut as late as the drop moment

log the set with cued_at = tappedAt, lead_ms = rest
respond, then performCut:
    sleep until cutAt − 2 s
    skip if the user's latest set is no longer this one (a newer rest/cue), its track changed (a swap), or Spotify is paused
    sleep until cutAt (re-measured, so earlier timer drift doesn't accumulate)
    play [drop, ...after] with drop at max(0, now − cutAt)            // late cut → start slightly in
```

`after` matters because a silent player at cut time reads as "paused" and the cut stands down. Queuing backup music behind every drop song (rest cuts, direct starts, and "Start in Ns" cues) keeps music going through the set and into the next rest, so the next Start rest finds something playing.

**Swap song** (`swapRest`): `dropAt` stays fixed; `left = dropAt − now`. The music is never replaced.

```
left <= new.drop_ms → play [new, ...after] now at new.drop_ms − left (+ elapsed); no cut
otherwise           → schedule a cut at dropAt − new.drop_ms
update the set to the new drop/track; the old cut sees the track change and stands down
```

The cut is a hard switch (the Web API can't fade, and iOS ignores volume commands). Spotify's crossfade setting doesn't affect timing: it only smooths hand-offs between fillers, and the drop song starts at the cut either way.

Accuracy limits: Spotify Connect latency from the play command to the phone (a few hundred ms, the same as Cue). Nudges absorb any consistent offset.

## 12. Hard rules for the coding agent

1. **Do not call** `/v1/audio-analysis`, `/v1/audio-features`, `/v1/recommendations`, or any endpoint not listed in Section 7.3. They are deprecated for new apps (they return 403) or out of scope.
2. **Do not stream, download, or process audio.** Only send playback commands.
3. All Spotify calls and all DB calls happen **server-side** in route handlers. The browser never sees Spotify tokens, the client secret, or the Supabase service role key. Do not create a browser Supabase client.
4. Do not use Supabase Auth. Auth is Spotify OAuth plus an iron-session cookie.
5. Never log tokens, the client secret, or the raw shortcut token.
6. Use `127.0.0.1`, not `localhost`, for the local redirect URI and local dev URL.
7. Validate all inputs with zod; return the error shape from Section 9 with correct HTTP codes (400 validation, 401 auth, 404 not found, 409 state conflict, 502 upstream Spotify failure).
8. Every user-facing error has a short `message` suitable for display in an iOS notification.
9. Route handlers run on the Node.js runtime (`export const runtime = 'nodejs'`) and are dynamic (`export const dynamic = 'force-dynamic'`).
10. Do not add features from Sections 5 or 18 unless asked.
11. Keep dependencies minimal: next, react, react-dom, tailwindcss, zod, @supabase/supabase-js, iron-session, vitest (dev). Ask before adding others.
12. Spotify's API changes over time. If an endpoint response differs from this spec, trust the current official Spotify Web API docs, adapt, and note the discrepancy in the README.

## 13. Environment, setup, and deployment

### 13.1 Environment variables (`.env.example`)

```
APP_URL=http://127.0.0.1:3000
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/callback
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=            # >= 32 chars, random
TOKEN_ENCRYPTION_KEY=      # 32 random bytes, base64 (openssl rand -base64 32)
```

Validate env at startup with zod in `lib/env.ts`; fail fast with a clear message.

### 13.2 Local development

1. `npm install`
2. Create a Supabase project; run `supabase/migrations/0001_init.sql` in the SQL editor (or via the Supabase CLI).
3. Fill in `.env.local`.
4. `npm run dev -- -H 127.0.0.1` and open `http://127.0.0.1:3000`.

Local testing covers auth, tagging, and cueing (playback commands reach the phone over Spotify Connect regardless of where the server runs). PWA install and the Shortcut require the deployed HTTPS URL.

### 13.3 Deployment

1. Push the repo to GitHub and import it into Vercel.
2. Set the env vars in Vercel with production values (`APP_URL` and `SPOTIFY_REDIRECT_URI` using the Vercel domain).
3. Add the production redirect URI in the Spotify dashboard.
4. Deploy, open it in Safari on the iPhone, log in, and add it to the home screen.

### 13.4 README

Generate a README covering: what the app is, setup steps (Sections 7.1, 13, 14), scripts, and known limitations (Section 19).

## 14. iOS Shortcut setup

Include these instructions in the README and in the token-created modal.

**Shortcut "Start Rest"** (v1.1, recommended for the Action button): same structure as "Cue Set" below with URL `/api/rest`. Optional JSON body `{ "restMs": 180000 }` to override the default rest.

**Shortcut "Cue Set":**

1. **Get Contents of URL**
   - URL: `https://<your-app>.vercel.app/api/cue`
   - Method: `POST`
   - Headers: `Authorization` = `Bearer <your token>`
   - Request Body: JSON (empty)
2. **Get Dictionary Value** → key `message` from the result. If `message` is missing (error response), get `error` → `message` instead. Simplest approach: an **If** block on whether `ok` has any value.
3. **Show Notification** with the value.

Bind it: Settings → Action Button → Shortcut → "Cue Set" (iPhone 15 Pro and later). Otherwise, Settings → Accessibility → Touch → Back Tap → Double Tap → "Cue Set".

**Shortcut "Mark Drop"** (optional, for hands-free tagging): same structure, URL `/api/drops/mark`. Can be run with Siri ("Hey Siri, mark drop").

**Shortcut "Nudge Later"** (optional): URL `/api/cue/nudge-last`, body `{ "deltaMs": 1000 }`.

## 15. Milestones and acceptance criteria

Build in this order. Do not start a milestone until the previous one's criteria pass.

### M0 — Scaffold
- Next.js + TypeScript + Tailwind + Vitest set up; env validation; migration file; lint/typecheck pass.
- ✅ `npm run build` and `npm test` succeed.

### M1 — Auth
- Login, callback, logout, `/api/me`, session, token encryption, `getValidAccessToken()` with refresh and rotation.
- ✅ The user can log in and see their display name; restarting the server keeps them logged in; a forced-expired access token is transparently refreshed.

### M2 — Reliability spike (manual verification, not a feature)
- A temporary cookie-only route `POST /api/debug/play` body `{ trackUri, positionMs }` that calls `playOnDevice`.
- The user tests with the iPhone locked after Spotify has been paused for 1, 3, and 5 minutes, and records the results in `docs/spike-results.md`.
- ✅ Results documented. If playback fails consistently at ≥ 3 minutes idle, note it in the README limitations. Immediate cueing (phone just used) is the v1 happy path regardless.
- Remove the debug route after M4.

### M3 — Tagging
- Now-playing card, Mark drop (cookie + bearer), Library list, nudge, test, enable/disable, delete, reorder.
- ✅ Marking during playback creates or updates a drop; re-marking overwrites; Test plays ~3 s before the drop.

### M4 — Cue
- `selectNextDrop`, `computeStartPosition`, `playOnDevice` with fallback, sets logging, Cue button, Last cued card with nudge, device linking in Settings.
- ✅ Pressing Cue starts a tagged song at `drop - lead` on the linked phone; repeats are avoided per settings; the message shows the actual lead.

### M5 — Shortcut tokens
- Create/list/revoke tokens; bearer auth restricted to the 3 routes.
- ✅ The iOS Shortcut from Section 14 cues a set with the phone locked immediately after the previous set; revoked tokens get 401.

### M6 — PWA polish + History + Settings
- Manifest, icons, iOS meta, safe areas, History page, all settings controls, empty and error states, README.
- ✅ Installs to the home screen, opens standalone, and all flows in Section 3 work end to end on an iPhone.

## 16. Testing

Unit tests (Vitest), required:

- `computeStartPosition`: normal case; drop earlier than the lead (clamps to 0, reports the real lead); override precedence; clamp near track end.
- `selectNextDrop`: forced id; exclusion window; relaxation when everything is excluded; single-drop case; sequential wrap-around; shuffle with a seeded random.
- Mark-drop math: reaction offset subtraction; clamp at 0.
- Nudge clamping `[0, duration_ms - 1]`.
- `crypto`: encrypt/decrypt round-trip; tamper detection (GCM auth failure throws); `hashToken` deterministic.
- Spotify client (mock `fetch`): 401 → refresh → retry; refresh token rotation persisted; `invalid_grant` → `needs_reauth`; 204 currently-playing → `playing:false`; 404 on play → devices → transfer → retry; 429 handling.
- `requireUser`: bearer accepted only on allowed routes; revoked token rejected.

Manual test checklist: every flow in Section 3 on a real iPhone with the Spotify app.

## 17. Error handling and edge cases

| Case | Behavior |
|---|---|
| Nothing playing when marking | 409 `NOTHING_PLAYING` — "Nothing is playing on Spotify." |
| Podcast/episode playing | Same as nothing playing |
| Local file (`is_local`) playing | 409 `UNSUPPORTED_TRACK` — "Local files can't be tagged." |
| No drops tagged | 409 `NO_DROPS` — "Tag some drops first." |
| All drops disabled | Same as `NO_DROPS` |
| No device linked and none found | 409 `NO_DEVICE` — "Open Spotify on your phone and try again." |
| Track unavailable in market / removed | Spotify error on play → 502 `TRACK_UNAVAILABLE` — "Couldn't play <name>. Try again." Do not auto-disable |
| Drop earlier than lead | Play from 0; message uses the real lead |
| Non-Premium user | 403 `PREMIUM_REQUIRED` — "Spotify Premium is required." |
| User not in dashboard User Management | 403 `SPOTIFY_FORBIDDEN` — "This Spotify account isn't enabled for DropSet." |
| Refresh token revoked | `needs_reauth` → 401 `REAUTH_REQUIRED` — "Log in to DropSet again." |
| Two rapid cue presses | The second simply cues the next song; no special handling needed |

## 18. Future versions (v2+) — do not build in v1

- ~~**Rest-timer sync (v2).**~~ Shipped in v1.1 as Start rest (Section 11.5), with the cut held in the request's `after()` instead of an external scheduler. Rests over 5:00 would need QStash or similar.
- **Exercise presets:** named rest and lead defaults (e.g. squat 3:00, accessories 2:00).
- **Shared drops:** pool tags across the ≤5 users; use the median `drop_ms` per track as the default when a user hasn't tagged it.
- **Stats:** which tracks correlate with better sets (requires logging set outcomes such as weight, reps, and RPE).
- **Automatic drop suggestion:** research only. It needs audio from outside Spotify, which raises licensing/ToS issues. A possible approach is onset/low-frequency energy novelty snapped to downbeats, or a music-structure segmentation model, always confirmed by the user.
- **Native iOS app** with the Spotify iOS SDK if Web API/Connect reliability proves insufficient.

## 19. Open risks

1. **Spotify Connect reachability.** If the Spotify app has been paused in the background for several minutes, iOS may suspend it and the phone may disappear from the device list, so remote `play` fails. Mitigation: the v1 happy path is cueing right as the user picks up the phone, plus the device fallback in Section 11.4 and the M2 spike to measure real behavior.
2. **Tagging precision.** `progress_ms` plus human reaction time is approximate (±~300 ms). Mitigation: reaction offset setting and nudge buttons; the lead time absorbs small errors.
3. **Development Mode limits.** 5 users max, and the app owner needs Premium. Acceptable for personal use.
4. **Rest cut (v1.1).** Relies on the serverless function staying alive for the rest (`after()`, ≤ 300 s on Hobby). If the cut fails, rest music keeps playing and the user can tap Start in Ns. Logged as `[rest] cut for set …: played|superseded|paused|failed`.
5. **Spotify API changes.** Spotify has restricted endpoints for Development Mode apps before. Keep API surface minimal (Section 7.3) and follow rule 12.
