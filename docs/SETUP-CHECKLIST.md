# DropSet setup checklist: from template to ready to use

Do these in order and tick each box as you go. The code is finished. Everything left is account setup, configuration, and testing on the phone.

**Where things stand now (2026-10-15)**

| Item | Status |
|---|---|
| `.env.local`: `APP_URL`, `SPOTIFY_REDIRECT_URI`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` | ✅ set |
| `.env.local`: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | ✅ set. Spotify app `DropSet` created, Web API enabled, 1/5 users (Phase 1) |
| `.env.local`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ set. Project `dropset` (us-east-1) in Kevin's Organization, migration applied, connection verified (Phase 2) |
| Production | ✅ <https://dropset-kevin.vercel.app>, deployed with the Vercel CLI (project `dropset-kevin`, GitHub-connected so pushes to `main` auto-deploy), 8 env vars set, Spotify prod redirect URI added (Phases 4–5) |
| Project moved to `~/Developer`, clean `npm install` | ✅ done. Tests 72/72, typecheck and lint clean (Phase 0) |
| Database | ✅ migrations 0001 and 0002 applied |

---

## Phase 0: Fix the iCloud problem (local machine only)

The project sits in `~/Desktop`, which iCloud syncs. iCloud has evicted about 11,800 files in `node_modules` to the cloud, so `npm run build`, `typecheck`, and `test` hang or time out. Vercel builds from GitHub, so this doesn't affect the deploy. It only matters for working locally.

- [x] Quit Claude Code and any dev server, then move the project out of iCloud:
  ```bash
  mkdir -p ~/Developer
  mv ~/Desktop/spotify-beatdrop ~/Developer/
  cd ~/Developer/spotify-beatdrop
  ```
- [x] Reinstall the dependencies cleanly:
  ```bash
  rm -rf node_modules .next tsconfig.tsbuildinfo
  npm install
  ```
- [x] Check that the toolchain works. Each command should finish in seconds or minutes, not hours:
  ```bash
  npm test           # expect 72/72 passing
  npm run typecheck
  npm run lint
  ```
  `npm run build` will still fail at this point because the Spotify and Supabase env vars are empty. That's expected.

---

## Phase 1: Spotify app (Developer Dashboard)

- [x] Go to <https://developer.spotify.com/dashboard> and click **Create app**.
  - Name: `DropSet`. Description: anything.
  - Redirect URI: `http://127.0.0.1:3000/api/auth/callback`. Spotify rejects `localhost`, so use the loopback IP exactly as written.
  - Under "Which API/SDKs are you planning to use?", tick **Web API**.
  - Accept the terms and save.
- [x] Open the app → **Settings** → copy the **Client ID**. Click **View client secret** and copy the **Client Secret**.
- [x] Paste both into `.env.local`:
  ```
  SPOTIFY_CLIENT_ID=...
  SPOTIFY_CLIENT_SECRET=...
  ```
- [x] Go to **User Management** and add the name and Spotify account email of everyone who will use the app, yourself included. Development Mode allows at most 5 users.
- [x] Confirm that every user, you included, has **Spotify Premium**. Playback control doesn't work without it.

You'll come back to this dashboard in Phase 5 to add the production redirect URI.

---

## Phase 2: Supabase (database)

- [x] Go to <https://supabase.com/dashboard> → **New project**.
  - Name: `dropset`. Set a database password and save it in your password manager. You won't need it in the app.
  - Region: whichever is closest to you. It should ideally match the Vercel function region from Phase 4 (Vercel defaults to `iad1`, Washington DC, so `us-east-1` is a good choice).
  - Wait about 2 minutes for it to provision.
- [x] Open **SQL Editor** → **New query**. Paste the full contents of `supabase/migrations/0001_init.sql` and click **Run**. It should report "Success. No rows returned".
- [x] Open **Table Editor** and confirm these 5 tables exist: `users`, `settings`, `drops`, `sets`, `api_tokens`. Each one should show RLS as enabled. RLS with no policies is intentional, because only the server's secret key talks to the database.
- [x] Open **Project Settings** → **API**, or **API Keys** in newer dashboards, and copy:
  - The **Project URL**, which looks like `https://abcdefgh.supabase.co`.
  - The **secret key**: either the new `sb_secret_...` key or the legacy `service_role` JWT. **Don't** use the `anon` or `publishable` key.
- [x] Paste both into `.env.local`:
  ```
  SUPABASE_URL=https://abcdefgh.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
  ```

> Treat the secret key like a password. Never put it in client code or commit it. `.env.local` is gitignored already.

---

## Phase 3: Local smoke test

This step catches config mistakes before you deploy, while it's still cheap to fix them.

- [x] `npm run dev`, then open <http://127.0.0.1:3000>. Use the IP, not `localhost`, or the login cookie won't match the redirect URI.
  - If the server immediately prints `Invalid environment configuration`, fix the variables it lists.
- [x] Click **Log in with Spotify**, approve the request, and confirm you land on Home.
  - A `403 / "This Spotify account isn't enabled for DropSet"` means your email isn't in User Management (Phase 1).
  - `INVALID_CLIENT: Invalid redirect URI` means the URI in the dashboard doesn't exactly match `SPOTIFY_REDIRECT_URI`.
- [x] In Supabase **Table Editor**, check that `users` now has 1 row and `settings` has 1 row.
- [x] Open Spotify on your phone and play something. In DropSet, go to **Settings → Device** and pick your phone.
- [x] Tag one song: play it, tap **Mark drop** when the drop hits, then tap **Test**. The phone should jump to 3 s before the drop.
- [x] Hit **Cue** on Home. The phone should start that song about 20 s before the drop.
- [x] Stop the dev server with Ctrl-C.

---

## Phase 4: Deploy to Vercel

The easiest route is importing from GitHub in the browser, which needs no CLI login.

- [x] Push the pending local commit so GitHub has the latest code:
  ```bash
  git push origin main
  ```
- [x] Go to <https://vercel.com/new> → **Import Git Repository** → pick `liukevinn/spotify-beatdrop`. Authorize the Vercel GitHub app if it asks.
- [x] On the configure screen:
  - **Project Name**: choose it carefully, because it becomes your URL, `https://<project-name>.vercel.app`. Something like `dropset-kevin` works. The rest of this checklist calls the result `<APP>`, for example `https://dropset-kevin.vercel.app`.
  - Framework Preset: **Next.js** (auto-detected). Leave the build settings at their defaults.
  - Expand **Environment Variables** and add all 8:

    | Key | Value |
    |---|---|
    | `APP_URL` | `<APP>`, e.g. `https://dropset-kevin.vercel.app` (no trailing slash) |
    | `SPOTIFY_REDIRECT_URI` | `<APP>/api/auth/callback` |
    | `SPOTIFY_CLIENT_ID` | same as `.env.local` |
    | `SPOTIFY_CLIENT_SECRET` | same as `.env.local` |
    | `SUPABASE_URL` | same as `.env.local` |
    | `SUPABASE_SERVICE_ROLE_KEY` | same as `.env.local` |
    | `SESSION_SECRET` | same as `.env.local` (or generate a new one: `openssl rand -base64 48`) |
    | `TOKEN_ENCRYPTION_KEY` | **same as `.env.local`** |

    > Local and prod share one database, so `TOKEN_ENCRYPTION_KEY` **must be identical** in both. Otherwise refresh tokens saved by one environment can't be decrypted by the other. Once you've set it, never change it. If you do, everyone has to log in again.
    >
    > Tip: you can paste the whole `.env.local` into the first key field and Vercel will split it into separate variables. Then edit `APP_URL` and `SPOTIFY_REDIRECT_URI` to the prod values.
- [x] Click **Deploy** and wait for it to go green.
- [x] Check the real domain: open the project → **Settings → Domains**. If the production domain isn't exactly the `<APP>` you used, because the name was taken and Vercel added a suffix, then:
  - update `APP_URL` and `SPOTIFY_REDIRECT_URI` under **Settings → Environment Variables**, and
  - go to **Deployments** → latest → **⋯ → Redeploy**. Env var changes only take effect after a redeploy.
- [x] Optional: under **Settings → Deployment Protection**, make sure **Vercel Authentication** doesn't cover the **production** domain. If it does, the iOS Shortcut can't reach `/api/cue`. Protection on preview deployments only is fine.

---

## Phase 5: Point Spotify at production

- [x] In the Spotify Developer Dashboard → your app → **Settings** → **Edit**, add a second redirect URI and **save**:
  ```
  <APP>/api/auth/callback
  ```
  Keep the `127.0.0.1` one too, so local dev still works.

---

## Phase 6: Install on the iPhone

- [ ] On the iPhone, open `<APP>` in **Safari**. It has to be Safari for "Add to Home Screen" to install it as a PWA.
- [ ] Log in with Spotify and confirm you reach Home.
- [ ] Tap **Share → Add to Home Screen** → Add. From now on, open DropSet from the home-screen icon.
- [ ] Open the installed app. If it asks you to log in again, do it. Home-screen apps keep their own cookies, separate from Safari.
- [ ] **Settings → Device**: with Spotify open and playing, select the iPhone.
- [ ] Tag 3–5 songs with **Mark drop**, then check each one with **Test** and adjust it with ±¼ s / ±1 s.

---

## Phase 7: iOS Shortcut (Action button)

- [ ] In DropSet → **Settings → Shortcut tokens**, create a token labelled e.g. `iPhone`. **Copy it right away.** It's only shown once.
- [ ] Open the **Shortcuts** app → **+** → name it **Start Rest** and add these actions:
  1. **Get Contents of URL**
     - URL: `<APP>/api/rest`
     - Method: **POST**
     - Headers: `Authorization` = `Bearer <your token>` (the word `Bearer`, a space, then the token)
     - Request Body: **JSON** (leave it empty)
  2. **Get Dictionary Value**: key `message` from *Contents of URL*.
  3. **If** *Dictionary Value* **has any value**
     - **Show Notification** → *Dictionary Value*

     **Otherwise**
     - **Get Dictionary Value**: key `error` from *Contents of URL*
     - **Get Dictionary Value**: key `message` from that
     - **Show Notification** → that value

     **End If**
- [ ] Run it once from the Shortcuts app. You should get a notification like `⏱ 3:30 rest → Song Name`, your music should keep playing, and the drop should land when the rest ends.
- [ ] Bind it:
  - iPhone 15 Pro or later: **Settings → Action Button → Shortcut → Start Rest**.
  - Older iPhones: **Settings → Accessibility → Touch → Back Tap → Double Tap → Start Rest**.
- [ ] Optional extra Shortcuts, built the same way:
  - **Cue Set**: URL `<APP>/api/cue`. Starts the song right before its drop, with no rest music.
  - **Mark Drop**: URL `<APP>/api/drops/mark`. Works with Siri: "Hey Siri, mark drop".
  - **Nudge Later**: URL `<APP>/api/cue/nudge-last`, body JSON `{ "deltaMs": 1000 }`.
- [ ] Revoke test: create a throwaway token, put it in a copy of the Shortcut, revoke it in DropSet, and run the copy. It should report an unauthorized error (401). Delete the copy afterwards.

---

## Phase 8: Locked-phone reliability spike

This answers the open question in `docs/spike-results.md`: does cueing still work when the phone has been locked with Spotify paused for a while?

- [ ] Follow the "How to run" steps in `docs/spike-results.md`. For each idle time (0, 1, 3, 5 min), run 3 attempts and record ✅ or ❌, plus any error message.
- [ ] Fill in the device, iOS version, and Spotify app version.
- [ ] Write the conclusion. If it fails consistently at 3 min or more, add that to "Known limitations" in the README.
- [ ] Commit: `git add docs/spike-results.md && git commit -m "Record locked-iPhone spike results" && git push`

---

## Phase 9: Real-world end-to-end check (at the gym)

- [ ] Open Spotify on the phone, play and pause a track, then lock the phone.
- [ ] Press the Action button. The tagged song should start about 20 s before its drop.
- [ ] Rest, set up, and start your set on the drop.
- [ ] Between sets, press the Action button again. You should get a different song, and recent ones shouldn't repeat (the default avoids the last 5).
- [ ] If a drop felt early or late, nudge it from the **Last set** card on Home ("The drop came… early/late"), or with the Nudge Later Shortcut.
- [ ] If you're adding friends (up to 4 more): add their emails in Spotify **User Management** first. Then they open `<APP>`, log in, and repeat Phases 6–7 on their own phone with their own token.

---

## Troubleshooting quick reference

| Symptom | Likely cause / fix |
|---|---|
| `Invalid environment configuration` in the logs | A variable is missing or malformed. The message lists which. On Vercel, fix it and **redeploy**. |
| `INVALID_CLIENT: Invalid redirect URI` | The redirect URI in the Spotify dashboard doesn't exactly match `SPOTIFY_REDIRECT_URI`. Check the scheme, domain, path, and trailing slash. |
| "This Spotify account isn't enabled for DropSet" | That email isn't in Spotify **User Management**. |
| `NO_DEVICE` / "no active device" | Open Spotify on the phone and play or pause something, then reselect the device in Settings. |
| Premium error | That account doesn't have Spotify Premium. |
| Shortcut returns 401 | The token is wrong or revoked, or the `Bearer ` prefix is missing. |
| Shortcut gets an HTML login page | Vercel Deployment Protection is covering production (Phase 4, last step). |
| Everyone suddenly has to log in again | `TOKEN_ENCRYPTION_KEY` or `SESSION_SECRET` changed. |
| Vercel function logs | Project → **Logs** (or `vercel logs <APP>` after `vercel login`). |
