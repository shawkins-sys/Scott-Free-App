# Scott Free: build progress

Brief: `scott-free-build-prompt.md` (v2) in the claude.ai Project. Repo: `shawkins-sys/Scott-Free-App` (public). Live: https://shawkins-sys.github.io/Scott-Free-App/

## Phase 1: Foundations (complete, 06/11/2026)
- Plain HTML/CSS/JS ES modules, no build step. GitHub Pages from `main` / root.
- Libraries pinned via jsDelivr: GridStack 14.1.0 (UMD `gridstack-all.js`), supabase-js 2.119.0 (`+esm`).
- `config.js`: app name, owner name, timezone, phone breakpoint (768px), Supabase URL and publishable key (project `fkcnfgevtwemgokrjxrk`).
- `registry.js`: hubs (id, title, icon, path) and tiles (id, path). Tile modules export default `{ id, title, defaultSize: { phone: {w,h}, desktop: {w,h} }, render(el), renderExpanded(el) }`. Hub modules export default `{ id, title, render(el) }`.
- `core/`: `app.js` (hash router `#/` and `#/hub/<id>`, hub bar, `hubsLocked()` stub returning false for Phase 2), `auth.js` (password then TOTP; enrol shows otpauth button, QR via Blob URL, grouped key with copy), `supabase.js`, `grid.js` (4 columns phone, 12 desktop, static until Edit, press-and-hold on touch, handles `se,s`), `layout-store.js` (Supabase `layouts` table plus localStorage cache, items saved with tile ids), `overlay.js`, `date.js` (London helpers: `todayKey`, `formatDate` DD/MM/YYYY, `friendlyDate`, `greeting`), `icons.js`, `theme.css`.
- Home: fixed greeting + friendly date + `#phrase-slot`, edit hint, `#checkin-slot`, grid, `#quiet-lines`, `#weekly-slot`, sign out link.
- `sw.js`: network-first for app files, cache-first for CDN, nothing else cached. Bump `VERSION` on each release.
- `supabase/schema.sql`: all 14 tables, RLS policy `owner_mfa` (user_id = auth.uid() and aal2) on all except `spotify_auth` (no policies, service role only). Private `photos` bucket. `ping()` RPC for keep-alive. `checkins.metrics` is jsonb so metrics can be added.
- `.github/workflows/keep-alive.yml`: every 3 days, uses secrets SUPABASE_URL and SUPABASE_ANON_KEY (apikey header only, publishable key).

## Decisions made
- Home top section is fixed, only content tiles are movable.
- Home date shows friendly form "Friday 6 November". DD/MM/YYYY everywhere else.
- No in-app password reset; reset via Supabase dashboard.
- Possible later: "Add another authenticator" option in Settings.

### Phase 2 decisions (06/11/2026)
- Check-in metrics (all 1 to 5, in `checkins.metrics`): mood, sleep, energy, emotional_stress, work_stress, physical. Add more via `METRICS` in `core/wellbeing.js`.
- Rating style: colour dots only, number shown on hover/press. Cool to warm scale (1 blue, 5 amber). Colour shows level, not good or bad.
- Hours slept: stepper in 0.5 h steps (0 to 14), starts from last entry or 7. Exercise yesterday: Yes/No. Note optional. Done enabled once all ratings and exercise are set.
- Phrase line is empty until the check-in is done. Picked once on Done and stored in `settings.data.dailyPhrase` ({ day, id }), fixed for the day.
- Phrase order: pinned (only one at a time) > tough days phrase on a tough day > random normal phrase, avoiding yesterday's. Tough day with no tough phrases falls back to normal.
- Seed phrase added once when the list is empty (`settings.data.phraseSeeded`), so deleting it does not bring it back.
- Today's check-in can be edited from the Wellbeing hub; the day's phrase does not change.

## Phase 2: Wellbeing core (complete, 06/11/2026)
- `core/wellbeing.js` (data), `core/checkin.js` (form), `core/app.js` (lock, phrase line, `afterCheckin()` hook for breathing and music later, refresh on new day), `hubs/wellbeing/index.js`, check-in styles in `theme.css`. `sw.js` VERSION sf-v6.

### Phase 3 decisions (06/11/2026)
- Photos tile shows a quiet line until today's check-in is done (space kept so tiles do not jump), then loads without a reload via the `sf:checkin-done` window event.
- Photos fill the tile (object-fit cover); full screen shows the whole photo.
- Weather shows no place name: "Your location", or "Cheltenham" on fallback. Units °C and mph.
- Weather expanded view: next 24 hours plus 7 days.

## Phase 3: Photos and Weather (built, awaiting Scott's test)
- `tiles/photos/index.js`: lists bucket root once per app load (jpg, jpeg, png, webp, gif, avif; HEIC skipped as Chrome cannot show it), shuffles, 8 s per photo, swipe, tap for full screen, shared pause. Each photo is downloaded via a 1 hour signed URL the first time it is shown and saved in Cache Storage `sf-photos`, keyed by name + eTag; deleted or replaced files are removed from the cache. Offline uses cached photos. Only prev/current/next held in memory.
- `sw.js`: VERSION sf-v7, `sf-photos` cache kept across updates.
- `tiles/weather/index.js`: Open-Meteo, geolocation (8 s timeout, 30 min max age) with Cheltenham fallback, result cached 15 min in localStorage, last forecast shown offline.

## Next: Phase 4 (Calendar, Plan hub, Edge Function, key dates)
Needs the personal calendar secret iCal URL (as a Supabase secret).
