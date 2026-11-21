# Scott Free: Handover for a New Chat

Last updated: 21/11/2026. Current release: `sw.js` VERSION `sf-v48` (Shopping list, habit questions, Music tile, background art rotation, Lights tile, app links on tiles).

Use this file to start a fresh chat. It replaces the need to re-read the old conversation.

## 1. Starter prompt for the new chat

> Continue building Scott Free. Read `claude/HANDOVER.md` and `claude/scott-free-build-prompt.md` in this Project. Attach `shawkins-sys/scott-free-app` with push access and clone it. Next feature: <choose from the roadmap>. Confirm the design decisions with me first before building.

## 2. Project basics

- **What it is:** "Scott Free", a personal life-hub PWA for Scott (UK).
- **Repo:** `shawkins-sys/scott-free-app` (public).
- **Live site:** https://shawkins-sys.github.io/Scott-Free-App/ (GitHub Pages).
- **Backend:** Supabase project `fkcnfgevtwemgokrjxrk`.
- **Brief:** `claude/scott-free-build-prompt.md` in the claude.ai Project (v2 plus section 14 addendum, now built).
- **Progress log:** `docs/PROGRESS.md` in the repo, mirrored to the Project doc `claude/PROGRESS.md`.

## 3. Working rules (must follow)

- Build in phases. Stop after each phase with: summary, Scott's to-dos, Android test steps. Wait for "continue".
- Explain the approach before major steps and flag decisions. Ask where unclear.
- Be efficient with tokens: targeted edits, no full-file rewrites unless needed. Pause in larger tasks and ask Scott to "resume".
- **Never use em dashes anywhere** (UI text, code comments, docs, commit messages).
- UK English, GBP, dates DD/MM/YYYY, timezone Europe/London.
- Bump `VERSION` in `sw.js` on every release, and add any new hub or tile files to the service worker precache list.
- Update `docs/PROGRESS.md` (repo and Project copy) after each phase.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <current session link>
  ```

## 4. Security rules (must follow)

- The repo is public. Never commit secrets.
- Allowed in front-end code only: Supabase URL and anon/publishable key, Google Client ID, Spotify Client ID.
- Everything else (calendar feed URLs, Spotify tokens and secret) lives server-side in Supabase secrets or tables.
- **Never store bank account numbers, sort codes or card numbers anywhere.** Never ask for a raw bank statement; use the in-app "Check statement" tool and its masked layout instead.
- Never put a client secret in the front end.
- All tables use RLS policy `owner_mfa` (requires aal2), except `spotify_auth`. Edge Functions check the user and aal2 themselves.

## 5. Standing behaviour rules

- Everything, Settings included, stays locked until the day's check-in is complete. No exceptions. This applies to every tile and every future build (Scott, 21/11/2026): enforced for every tile in `core/grid.js` (`renderTile()`), so new tiles are covered automatically.
- App lock (phone and desktop): 4-digit PIN or fingerprint, asked on open and after 1 minute away. 5 wrong tries cause a 5-minute wait. Applies on every device except the wall display.
- Wall display (tablet/TV): no app lock. Settings needs the hub PIN (Wellbeing optionally). Plan stays open. **Money hub is fully hidden on the wall** (not in the hub bar, route redirects Home, no money lines in the weekly card or quiet lines).
- Mood colours run soft red (1) to green (5). Emotional and work stress are reversed (1 = green). Warnings use the separate amber `--alert`.
- Sleep: 7 to 8 hours is good; below 7 or above 8 shows red.

## 6. Tech stack

- Plain HTML/CSS/JS ES modules, no build step. Hash router (`#/`, `#/hub/<id>`).
- `registry.js` registers hubs and tiles. GridStack 14.1.0 tile grid (18px rows; tile defaultSize in 72px blocks scaled x4; saved items carry `s: 4`).
- `settings.data` (jsonb) holds preferences.
- Service worker precaches shell plus all hub and tile files. Keeps `sf-cdn` and `sf-photos` caches across versions. Offline pill, localStorage `sf-today-checkin` fallback.
- WebAuthn platform authenticator for fingerprint. PBKDF2-SHA256 (150k) salted PIN hashes.
- Screen Wake Lock for the wall display and breathing exercise.
- Libraries pinned on jsDelivr: Chart.js 4.6.1, PapaParse 5.7.0 (+esm), pdf.js 6.5.438 (blob module worker).
- Integrations: Spotify Web API (PKCE, needs Premium), Google Photos Picker API (OAuth implicit redirect, `detectSessionInUrl: false` on supabase-js), ical.js 2.1.0 in the calendar function, Open-Meteo weather, gov.uk bank holidays with a 2026 to 2027 fallback list.
- Edge Functions: `calendar-feed`, `spotify`, `photos-import`, `lights`.
- Lights: Hue through Alexa via the Voice Monkey skill (free plan, 3 triggers: Living room on, Bedroom on, All off). Device IDs in `supabase/functions/lights/index.ts`, token in secret `VOICEMONKEY_TOKEN`. Setup in `docs/LIGHTS-SETUP.md`.

## 7. File map (repo root)

**Core**
- `core/app.js`: router, hub bar, Home, wall mode start, hub PIN gate, app lock, `afterCheckin` (phrase, breathing if a stress is 5, morning music), weekly card, offline pill.
- `core/wellbeing.js`: METRICS (stress has `reverse: true`), `levelOf()`, check-ins, phrases, settings helpers, `listCheckins`.
- `core/checkin.js`: check-in form (6 metrics, sleep range, "One good thing that happened yesterday (optional)").
- `core/applock.js`: PIN and fingerprint app lock.
- `core/device.js`, `core/wall.js`, `core/hubpin.js`: wall display and hub PIN.
- `core/money.js`, `core/payschedule.js`, `core/statement.js`, `core/statement-pdf.js`: money and statement import (PDF parser provisional).
- `core/keydates.js`, `core/calendar.js`, `core/quiet-lines.js`.
- `core/shopping.js`: shopping data, local copy and offline outbox.
- `core/habits.js`: habit definitions for the check-in.
- `core/livedot.js`: green/red status dot above the Home greeting.
- `core/applink.js`: "Open <app>" links on tiles (Android intent, web fallback). Add new apps to `APPS`.
- `core/background.js`: daily background scene rotation (see section 12).
- `core/spotify.js`, `core/music.js`, `core/breathing.js`, `core/trends.js`, `core/weekly.js`.
- `core/theme.css`: theme, `--lvl-1` to `--lvl-5`, `--alert`.

**Hubs**
- `hubs/wellbeing/` (index, trends), `hubs/plan/` (index, shopping), `hubs/money/` (index, import, spending), `hubs/settings/` (index, music, phrases, habits, wall).
- Settings sections: music, phrases, habits, lock, wall, breathing, pay, photos (pay and lock hidden on the wall).

**Tiles:** `tiles/weather`, `tiles/photos`, `tiles/calendar`, `tiles/music`, `tiles/lights`.

**Server:** `supabase/functions/{calendar-feed,spotify,photos-import,lights}/index.ts`.

**Docs:** `README.md`, `docs/PROGRESS.md`, `docs/ANDROID-TESTING.md` (includes tablet section), `docs/CALENDAR-SETUP.md`, `docs/SPOTIFY-SETUP.md`, `docs/GOOGLE-PHOTOS-SETUP.md`, `docs/LIGHTS-SETUP.md`.

## 8. Testing approach

- Headless Chrome via Playwright (`/usr/bin/google-chrome`).
- Use a browser context with `service_workers='block'` so route stubs work.
- Stub Supabase and CDN libraries with `page.route`, including CORS headers.
- Local static server on port 8766 (repo root). Restart it after pauses. Reload after a hash change.
- Check light and dark mode for visual changes.

## 9. Scott's outstanding setup (remind him at the end of the build)

0. **Lights:** set `VOICEMONKEY_TOKEN`, deploy `lights` (Verify JWT off), test the 3 buttons and Open Hue on Android.
1. **Calendar:** done 21/11/2026 (secret set, `calendar-feed` deployed, Verify JWT off).
2. **Google Photos:** put the Client ID in `config.js` `googleClientId`, deploy `photos-import`.
3. **Spotify:** Client ID in `config.js`, secret set and `spotify` deployed (21/11/2026). Scott to connect in Settings and add playlists. Settings, Morning music has a "Plays on" switch (`settings.data.music.playOn`, default phone) because the Spotify Web API does not list Sonos; Scott uses phone and switches to the Sonos from his lock screen. Speaker mode keeps the original home/away logic. Possible later: Sonos Control API with Sonos Favourites.
4. **Bank statement:** run "Check statement" on a Lloyds PDF, send the masked layout if needed, plus the employer payer description. Then finalise `parseLines()` and the employer pattern.
5. **Bank holidays:** confirm the gov.uk fetch works on the phone (CORS).
6. **Wall display:** SQL done (21/11/2026). Set the hub PIN from the phone, then test on a tablet.

Done 21/11/2026: shopping, habits and wall SQL run by Scott; `sf-v34` pushed live.

## 10. Shopping List (built 17/11/2026)

Section inside Plan. Multiple lists, items with quantity and notes, ticked items in a "Done" group with "Clear ticked", staples per list, editable on the wall, works offline with an outbox (latest change wins). Single user. SQL in `supabase/shopping.sql`. Details in `docs/PROGRESS.md`.

**Future: family sharing.** Scott wants to share lists with chosen family members later. Data is ready (items and staples hang off `list_id`). Needs a `shopping_list_members` table, new policies on the three shopping tables only, and a decision on whether family accounts must use MFA (the current policies require aal2).

## 10b. Habit questions (built 21/11/2026)

Required questions about yesterday in the check-in (alcohol, social media, caffeine after 2pm, screens in bed), managed in Settings, Habits. Patterns in Wellbeing trends after 14 check-ins with 5+ days each side. SQL in `supabase/habits.sql`.

## 12. Background images (in progress)

4 scenes rotate daily: beach, palms, coral, leaves. Each needs phone day, phone night, wall day (landscape 16:10), wall night. Done: beach phone day and night. To add one: compress to WebP (quality about 78, phone up to 1080 px wide, wall up to 2560 px), save as `assets/bg/<scene>-<phone|wall>-<day|night>.webp`, fill the path in `SCENES` in `core/background.js`, bump that scene's `v` if replacing. If the beach `v` changes, update `BG_FALLBACK` in sw.js. Bump sw.js VERSION. Keep composition: plain top, detail at edges and bottom.

## 11. Next step

Not chosen. Music tile and live status dot built 21/11/2026 (see PROGRESS).

Other roadmap options: countdown timers, push notifications, positive news tile, home move hub, photo frame mode for the wall, family sharing for shopping lists.
