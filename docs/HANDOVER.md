# Scott Hub (formerly Scott Free): Handover for a New Chat

Last updated: 24/11/2026. Current release: `sw.js` VERSION `sf-v104` (calm Home complete on the phone, all three phases; bottom bar icons only, slim glass; Wellbeing cards fold; Lists count shows lists; Morning page; timers and wall alarms; timed app lock; faster loading).

Use this file to start a fresh chat. It replaces the need to re-read the old conversation.

## 1. Starter prompt for the new chat

> Continue building Scott Hub (formerly Scott Free). Read `claude/HANDOVER.md`, `claude/CALM-HOME-PLAN.md`, `claude/FUTURE-UPDATES.md`, `claude/MORNING-PLAN.md` and `claude/scott-free-build-prompt.md` in this Project. Attach `shawkins-sys/scott-free-app` with push access and clone it. Next feature: <choose from the roadmap>. Confirm the design decisions with me first before building.

## 2. Project basics

- **What it is:** "Scott Hub" (renamed from "Scott Free" on 21/11/2026, display name and icon only; repo, URL, storage keys and developer dashboard names keep the old name), a personal life-hub PWA for Scott (UK).
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
- Bump `VERSION` in `sw.js` on every release, and add any new hub or tile files to the service worker precache list. Essential since sf-v80: app files are served cache first, so a release only reaches devices when VERSION changes (the new worker precaches everything fresh with `cache: 'reload'`).
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
- App lock (phone and desktop): 4-digit PIN or fingerprint, asked when the app is opened or returned to after being closed or in the background for longer than a per-device limit (Settings, App lock: 1 min, 15 min, 1 hour, 2 hours or 4 hours; default 2 hours, Scott 24/11/2026). Lock now always asks. 5 wrong tries cause a 5-minute wait. Applies on every device except the wall display.
- Wall display (tablet/TV): no app lock. Settings needs the hub PIN (Wellbeing optionally). Plan stays open. Money was removed everywhere on 22/11/2026 (see section 13).
- Mood colours run soft red (1) to green (5). Emotional and work stress are reversed (1 = green). Warnings use the separate amber `--alert`.
- Sleep: 7 to 8 hours is good; below 7 or above 8 shows red.

## 6. Tech stack

- Plain HTML/CSS/JS ES modules, no build step. Hash router (`#/`, `#/hub/<id>`).
- Tile contents adapt to tile width with container queries (`.tile-body` is container `tile`, rem units); give new tiles the same treatment.
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
- `core/device.js` (also `isPhoneDevice()`: any mobile browser is phone), `core/wall.js`, `core/hubpin.js`, `core/frame.js` (photo frame mode): wall display and hub PIN.
- `core/money.js`, `core/payschedule.js`, `core/statement.js`, `core/statement-pdf.js`: old Money code, switched off (kept; `core/money.js` still used by the one-off renewals card).
- `core/morning.js`: Morning page data (device copy, section switches). `core/timers.js`, `core/alarms.js` (wall), `core/frame.js` (wall photo frame).
- `core/keydates.js`, `core/calendar.js`, `core/quiet-lines.js`.
- `core/shopping.js`: shopping data, local copy and offline outbox.
- `core/habits.js`: habit definitions for the check-in.
- `core/livedot.js`: green/red status dot above the Home greeting.
- `core/applink.js`: "Open <app>" links on tiles (Android intent, web fallback). Add new apps to `APPS`.
- `core/background.js`: daily background scene rotation (see section 12).
- `core/calm.js`: calm Home (phone only): `useCalm()`, `homeStyle()`/`setHomeStyle()` (`settings.data.homeStyle`, device copy `sf-home-style`), `calmHomeHtml()`, `revealCalm()` (Checked in mark, photo card, card row). `core/calm-cards.js`: the swipe row of glass cards. `core/calm-upnext.js`: the Up next card. Photos tile exposes `renderInline()` for the card.
- `core/spotify.js`, `core/music.js`, `core/breathing.js`, `core/trends.js`, `core/weekly.js`.
- `core/theme.css`: theme, `--lvl-1` to `--lvl-5`, `--alert`.

**Hubs**
- `hubs/morning/` (Morning page), `hubs/wellbeing/` (index, trends), `hubs/plan/` (index, shopping, timers, alarms, renewals), `hubs/settings/` (index, music, phrases, habits, wall, slideshow, timers, morning, background, backup). `hubs/money/` kept but not in `registry.js`.
- Settings sections, grouped under headings (21/11/2026): Daily routine (music, phrases, habits, breathing), Customisation (home style (phone only), background, photos), Device and security (lock, wall, backup and export, Sign out). App lock hidden on the wall. Daily routine also has Timer presets and Morning page. New sections need a `group` in `SECTIONS`.

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

0. **Lights:** done 21/11/2026 (token set, `lights` deployed, tested). Open Hue goes to the Play Store page (Hue accepts no browser links).
1. **Calendar:** done 21/11/2026 (secret set, `calendar-feed` deployed, Verify JWT off).
2. **Google Photos:** done 21/11/2026 (Google Cloud project "Scott Hub" in Testing with Scott as test user, Client ID in `config.js`, `photos-import` deployed with Verify JWT off, first import of 6 photos worked).
3. **Spotify:** done 21/11/2026 (connected, resume of last played confirmed working). Settings, Morning music has a "Plays on" switch (`settings.data.music.playOn`, default phone) because the Spotify Web API does not list Sonos; Scott uses phone and switches to the Sonos from his lock screen. Speaker mode keeps the original home/away logic. Possible later: Sonos Control API with Sonos Favourites.
4. **Bank statement:** no longer needed (Money removed 22/11/2026).
7. **Morning:** done 24/11/2026 (`morning` deployed, Verify JWT off, `FOOTBALL_DATA_TOKEN` set). Redeploy `morning` after any change to `supabase/functions/morning/index.ts`.
5. **Bank holidays:** confirm the gov.uk fetch works on the phone (CORS).
6. **Wall display:** SQL done (21/11/2026). Set the hub PIN from the phone, then test on a tablet.

Done 21/11/2026: shopping, habits and wall SQL run by Scott; `sf-v34` pushed live.

## 10. Shopping List (built 17/11/2026)

Section inside Plan, shown as "Lists" (renamed 21/11/2026; code and tables keep shopping_ names). Lists are collapsible rows (one open at a time, all closed on arrival). Multiple lists, items with quantity and notes, ticked items in a "Done" group with "Clear ticked", staples per list, editable on the wall, works offline with an outbox (latest change wins). Single user. SQL in `supabase/shopping.sql`. Details in `docs/PROGRESS.md`.

**Future: family sharing.** Scott wants to share lists with chosen family members later. Data is ready (items and staples hang off `list_id`). Needs a `shopping_list_members` table, new policies on the three shopping tables only, and a decision on whether family accounts must use MFA (the current policies require aal2).

## 10b. Habit questions (built 21/11/2026)

Required questions about yesterday in the check-in (alcohol, social media, caffeine after 2pm, screens in bed), managed in Settings, Habits. Patterns in Wellbeing trends after 14 check-ins with 5+ days each side. SQL in `supabase/habits.sql`.

## 12. Background images (in progress)

Any number of scenes (Scott wants more than 4 over time); add an entry to `SCENES` in `core/background.js`. Live: beach, palms ("Palm trees"), coral, rainforest, winter, mountains ("Misty mountains"). Planned: northern lights (with aurora). Each needs phone day, phone night, wall day (landscape 16:10), wall night. Done: all six scenes, phone and wall, day and night (21/11/2026; beach replaced with a new set, v 2). Landscape (wall) images are used on the wall display and on any screen wider than tall. To add one: compress to WebP (quality about 78, phone up to 1080 px wide, wall up to 2560 px), save as `assets/bg/<scene>-<phone|wall>-<day|night>.webp`, fill the path in `SCENES` in `core/background.js`, bump that scene's `v` if replacing. If the beach `v` changes, update `BG_FALLBACK` in sw.js. Bump sw.js VERSION. Keep composition: plain top, detail at edges and bottom.

## 13. Morning page (built 22 to 24/11/2026)

Replaced Money (Scott: Money felt like work; the app is to help him switch off). Full decisions and sources in `claude/MORNING-PLAN.md`. One briefing page: Man Utd last and next match as score boxes, matchday results and table folded; headlines with small pictures: Man Utd and FPL daily, plus one rotating topic a day (Phones and new tech, PlayStation, Fishkeeping, Cheltenham; 3 stories from the past week); One good thing; On this day; heavy news filtered. Edge Function `morning` (football-data.org token, RSS feeds, Wikipedia). Settings, Daily routine, Morning page switches topics.

## 14. Other builds since 21/11/2026 (details in PROGRESS.md)
- Timers in Plan (all devices) and alarms in Plan (wall only, kept on the tablet; may move to the account later so the phone can set them).
- App lock is timed: asks after longer than the device's limit away (default 2 hours, Settings, App lock).
- Faster start: app files served cache first (release only arrives when VERSION changes), tiles load in parallel, layout and check-in from the device copy first.
- Tiles adapt to their size (container queries); foldable inner screen uses the phone layout.
- Home key dates line is a readable pill. Open app links are small pill buttons.
- Another chat (24/11/2026) made Plan's Key dates and Lists open on tapping the heading, with counts (sf-v88, sf-v89). Work in one chat at a time to avoid clashing pushes; if a push is refused, rebase on origin/main and take the next VERSION number.

## 11. Next step (end of 24/11/2026 session)

Suggested order:
0. **Calm Home: done (sf-v99 to sf-v101).** Plan in `docs/CALM-HOME-PLAN.md`. Phase 1: `core/calm.js`, Settings, Home style, photo card, check-in gate. Phase 2: `core/calm-cards.js` (Weather, Music, Lights sheet, Calendar link), `core/music-resume.js`. Phase 3: `core/calm-upnext.js` (key dates today or tomorrow). Scott to check on the phone; possible later: overdue items in Up next, Lights toggle if Lights moves to the Hue Remote API (state and per-room off become possible).
1. **Morning Phase 3 polish** (list in `claude/MORNING-PLAN.md`): One good thing picture for Good News Network, summary cut at a sentence, team names on one line, check each rotating topic on its day and swap failing feeds, wall sizes.
2. **New background art** (Scott plans to add more scenes; see section 12 for how).
3. **Scott's setup**: wall display hub PIN and tablet test (photo frame mode, alarms sound after a reload), confirm bank holidays load on the phone.
4. **Parked ideas** (FUTURE-UPDATES): Lights on the Hue Remote API (item 6, frees the Voice Monkey triggers), Tesla sync, alarms set from the phone. Older roadmap: countdown timers, push notifications, home move hub, family sharing for lists.
