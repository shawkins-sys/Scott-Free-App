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

## Next: Phase 2 (Wellbeing core)
Check-in, hub lock, daily phrases (rotation, tough days, pinning, seed phrase), Wellbeing hub phrase management. Confirm check-in face/colour style with Scott before building.
