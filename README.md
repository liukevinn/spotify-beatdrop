# DropSet

A personal tool that starts a Spotify song a set number of seconds before its beat drop, so you can get set up during the build-up and start your set exactly on the drop.

- **Tag drops** while listening: tap **Mark drop** when the drop hits. DropSet saves the timestamp (minus your reaction time).
- **Cue a set** at the gym: one tap (or the iPhone Action button via an iOS Shortcut) starts the next tagged song at `drop − lead` (default 20 s) on your phone.
- **Nudge** a drop ±¼ s / ±1 s after a set if it felt early or late.

DropSet only sends playback commands through the Spotify Web API (Spotify Connect). It never streams or analyses audio. It ships as an installable PWA; there's no App Store app.

See [`SPEC.md`](SPEC.md) for the full product and technical specification.

---

## Stack

Next.js 15 (App Router, TypeScript strict) · Tailwind CSS 4 · zod · Supabase Postgres (server-side, service role only) · iron-session · Vitest · Vercel.

```
app/(app)/            signed-in screens: Home, Library, History, Settings (+ auth gate, tab bar)
app/login/            login screen
app/api/**/route.ts   JSON API (thin handlers → lib/services, lib/db, lib/spotify)
components/           UI, grouped by screen
lib/auth/             iron-session + requireUser (cookie or shortcut bearer token)
lib/spotify/          OAuth, API client (refresh/retry semantics), playOnDevice fallback
lib/db/               all Supabase queries, always scoped by user_id
lib/logic/            pure functions: start position, queue selection, drop math, formatting
lib/services/         use-cases shared by routes: mark, nudge, test, cue
supabase/migrations/  schema
tests/                Vitest unit tests
```

## Setup

### 1. Spotify app (Developer Dashboard)

1. Create an app at <https://developer.spotify.com/dashboard> and enable the **Web API**.
2. Add redirect URIs:
   - Local: `http://127.0.0.1:3000/api/auth/callback`. Spotify rejects `localhost`, so use the loopback IP.
   - Prod: `https://<your-app>.vercel.app/api/auth/callback`
3. Under **User Management**, add the Spotify account email of every user (max 5 in Development Mode).
4. Copy the **Client ID** and **Client Secret**.

The app owner needs Spotify Premium, and so does every user, because playback control requires Premium.

### 2. Supabase

Create a project, then run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in the SQL editor (or `supabase db push`). Copy the **Project URL** and the **service_role** key (Settings → API). Supabase is used only as a database: no Supabase Auth, no browser client, and RLS is on with no policies. Either the legacy `service_role` JWT or a new `sb_secret_…` key works.

**Optional, for local development:** with Docker running, `supabase start` spins up a local Postgres with the migration applied (`SUPABASE_URL=http://127.0.0.1:54321`).

### 3. Environment

```bash
cp .env.example .env.local
```

| Variable | Value |
|---|---|
| `APP_URL` | `http://127.0.0.1:3000` locally; your Vercel URL in prod |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | from step 1 |
| `SPOTIFY_REDIRECT_URI` | `${APP_URL}/api/auth/callback` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | from step 2 |
| `SESSION_SECRET` | `openssl rand -base64 48` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (must decode to 32 bytes) |

The server validates these at startup and fails fast with a list of what's wrong.

### 4. Run locally

```bash
npm install
npm run dev          # binds to 127.0.0.1:3000
```

Open <http://127.0.0.1:3000>. Local dev covers login, tagging, and cueing, because playback commands reach your phone over Spotify Connect no matter where the server runs. PWA install and the Shortcut need the deployed HTTPS URL.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on `127.0.0.1:3000` |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Vitest unit tests |
| `npm run test:db` | DB integration tests against a real Supabase. Set `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` to a local or throwaway instance, never prod |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `node scripts/generate-icons.mjs` | Re-render the PWA icons in `public/icons/` |

## Deploy (Vercel)

1. Push to GitHub and import the repo into Vercel.
2. Set all env vars with production values (`APP_URL` and `SPOTIFY_REDIRECT_URI` use the Vercel domain).
3. Add the production redirect URI in the Spotify dashboard.
4. Deploy, open the site in Safari on your iPhone, log in, then **Share → Add to Home Screen**.

## First-time use

1. **Settings → Device:** open Spotify on your phone, tap **Refresh**, then tap your phone to link it.
2. **Settings → Playback:** set the lead time (5–60 s), reaction offset, queue mode, and repeat avoidance.
3. **Settings → Shortcut tokens:** create a token. It's shown **once**, so copy it into the Shortcut below.

## iOS Shortcut

**"Cue Set"**

1. **Get Contents of URL**
   - URL: `https://<your-app>.vercel.app/api/cue`
   - Method: `POST`
   - Headers: `Authorization` = `Bearer <your token>`
   - Request Body: JSON (empty)
2. **If** the result's `ok` has any value → **Get Dictionary Value** `message`. Otherwise → get `error` → `message`.
3. **Show Notification** with that value (e.g. `▶ Song Name — drop in 20s`).

Bind it under **Settings → Action Button → Shortcut → "Cue Set"** (iPhone 15 Pro and later). On other iPhones, use **Settings → Accessibility → Touch → Back Tap → Double Tap → "Cue Set"**.

Optional shortcuts, built the same way:

- **"Mark Drop"**: URL `/api/drops/mark`. Works with Siri ("Hey Siri, mark drop").
- **"Nudge Later"**: URL `/api/cue/nudge-last`, body `{ "deltaMs": 1000 }`.

Only these three endpoints accept bearer tokens. Everything else requires the browser session. Revoke a token in Settings and it stops working immediately.

## Testing

`npm test` runs unit tests for:

- the start-position and queue-selection algorithms
- mark and nudge math
- AES-GCM encryption and token hashing
- the Spotify client, with mocked `fetch`: 401 → refresh → retry, refresh-token rotation, `invalid_grant` → re-auth, 403/429/5xx handling, and 204 now-playing
- the `playOnDevice` device fallback
- `requireUser` bearer/cookie rules
- the cue, mark, and nudge services

Before relying on it at the gym, run through the manual checklist (every flow in SPEC §3) on a real iPhone.

## Known limitations

1. **Spotify Connect reachability.** If Spotify has been paused in the background for a few minutes, iOS may suspend it and the phone drops off the device list, so remote play fails with "Open Spotify on your phone and try again." The reliable path is cueing right as you pick up the phone. DropSet also retries by re-finding the phone and transferring playback. See [`docs/spike-results.md`](docs/spike-results.md) to record real-world behaviour.
2. **Tagging precision.** Now-playing progress plus human reaction time is accurate to about ±300 ms. The reaction offset setting and the nudge buttons correct for it, and the lead time absorbs the rest.
3. **Development Mode limits.** Max 5 users, and the app owner needs Premium.
4. **Spotify API changes.** DropSet only uses `GET /me`, `GET /me/player/currently-playing`, `GET /me/player/devices`, `PUT /me/player`, and `PUT /me/player/play`.

## Notes and deviations from the spec

- **Spotify API (checked September 2026).** The February 2026 Development Mode changes removed `linked_from` (and others) from track objects. DropSet never used it: it always takes `item.id`/`item.uri` as returned. All five endpoints above are still available.
- **Route group.** The signed-in pages live in `app/(app)/` so they share one auth-gated layout and tab bar. URLs are unchanged (`/`, `/library`, `/history`, `/settings`).
- **M2 debug route.** `POST /api/debug/play` is omitted because the spec says to remove it after M4. Run the reliability spike with the Library's **Test** button or **Cue set**, which both use the same `playOnDevice` path.
- **Local files.** `/api/player/now` reports `playing: false` for local files (they have no Spotify track id). Marking one returns `UNSUPPORTED_TRACK`.
- **Extra error codes** beyond the spec table: `VALIDATION` (400), `NOT_FOUND` (404), `NO_SETS` (409, nudge-last before any cue), `SPOTIFY_ERROR` (502, upstream failure after retries), and `INTERNAL` (500).
- **Dev-only tooling dependencies** beyond the spec's list: `typescript` (pinned to 5.x for Next 15), `@types/*`, `@tailwindcss/postcss` (the Tailwind 4 PostCSS plugin), and `eslint` + `eslint-config-next` + `@eslint/eslintrc`. Runtime dependencies are exactly the spec's.
- `npm audit` flags the PostCSS copy bundled inside Next 15. It runs only at build time, and the suggested fix would force Next 16.
