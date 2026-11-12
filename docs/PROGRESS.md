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

## Before finishing (Scott asked to be reminded at the end)
- Calendar: add secret `CALENDAR_FEEDS` and deploy `calendar-feed` (docs/CALENDAR-SETUP.md).
- Google Photos: Google Cloud client ID into `config.js`, deploy `photos-import` (docs/GOOGLE-PHOTOS-SETUP.md).
- Statement import: Scott to send a redacted Lloyds CSV sample and the employer payer description; finalise `parseStatement()` and set the employer pattern.
- Check gov.uk bank holidays fetch works from the browser (CORS). If not, move it to an Edge Function (fallback list covers 2026 to 2027).

## Decisions made
- Home top section is fixed, only content tiles are movable.
- Home date shows friendly form "Friday 6 November". DD/MM/YYYY everywhere else.
- No in-app password reset; reset via Supabase dashboard.
- Possible later: "Add another authenticator" option in Settings.
- (12/11/2026) Grid rows are 18px (was 72px) for finer tile resizing. Tile `defaultSize` stays in 72px blocks and is scaled x4; saved layout items carry `s: 4`, older ones (no `s`) are scaled on load. Minimum tile height 3 rows (54px).

### Phase 2 decisions (06/11/2026)
- Check-in metrics (all 1 to 5, in `checkins.metrics`): mood, sleep, energy, emotional_stress, work_stress, physical. Add more via `METRICS` in `core/wellbeing.js`.
- Rating style: colour dots only, number shown on hover/press. Cool to warm scale (1 blue, 5 amber). Colour shows level, not good or bad.
- Hours slept: stepper in 0.5 h steps (0 to 14), starts from last entry or 7. Exercise yesterday: Yes/No. Note optional. Done enabled once all ratings and exercise are set.
- Phrase line is empty until the check-in is done. Picked once on Done and stored in `settings.data.dailyPhrase` ({ day, id }), fixed for the day.
- Phrase order: pinned (only one at a time) > tough days phrase on a tough day > random normal phrase, avoiding yesterday's. Tough day with no tough phrases falls back to normal.
- Seed phrase added once when the list is empty (`settings.data.phraseSeeded`), so deleting it does not bring it back.
- Today's check-in can be edited from the Wellbeing hub; the day's phrase does not change.
- (09/11/2026) Note label is "One good thing that happened yesterday". Hours slept shows red below 7 or above 8 (best is 7.5), in the form and the Wellbeing summary (`SLEEP_OK_MIN/MAX` in `core/checkin.js`).

## Phase 2: Wellbeing core (complete, 06/11/2026)
- `core/wellbeing.js` (data), `core/checkin.js` (form), `core/app.js` (lock, phrase line, `afterCheckin()` hook for breathing and music later, refresh on new day), `hubs/wellbeing/index.js`, check-in styles in `theme.css`. `sw.js` VERSION sf-v6.

### Phase 3 decisions (06/11/2026)
- Photos tile shows a quiet line until today's check-in is done (space kept so tiles do not jump), then loads without a reload via the `sf:checkin-done` window event.
- Photos fill the tile (object-fit cover); full screen shows the whole photo.
- Weather shows no place name: "Your location", or "Cheltenham" on fallback. Units °C and mph.
- Weather expanded view: next 24 hours plus 7 days.

## Phase 3: Photos and Weather (complete, 07/11/2026)
- `tiles/photos/index.js`: lists bucket root once per app load (jpg, jpeg, png, webp, gif, avif; HEIC skipped as Chrome cannot show it), shuffles, 8 s per photo, swipe, tap for full screen, shared pause. Each photo is downloaded via a 1 hour signed URL the first time it is shown and saved in Cache Storage `sf-photos`, keyed by name + eTag; deleted or replaced files are removed from the cache. Offline uses cached photos. Only prev/current/next held in memory.
- `sw.js`: VERSION sf-v7, `sf-photos` cache kept across updates.
- `tiles/weather/index.js`: Open-Meteo, geolocation (8 s timeout, 30 min max age) with Cheltenham fallback, result cached 15 min in localStorage, last forecast shown offline.

### Photos from Google Photos (added 06/11/2026, Scott's request)
- Google removed library read access (March 2025), so no live album link. Uses the Photos Picker API: Scott chooses photos in Settings every few months; copies resized to 2048px are saved to the `photos` bucket. Choosing again replaces the set (files named `gp-<id>.<ext>`, already-present items skipped, others removed).
- Google photo links have no CORS, so `supabase/functions/photos-import` (Edge Function, service role, checks user + aal2) downloads and uploads. Actions `import` (5 items per call) and `remove`.
- Google sign-in: OAuth implicit redirect (more reliable than a popup in the Android PWA), scope `photospicker.mediaitems.readonly`, token in sessionStorage only. `core/google.js`, `captureGoogleReturn()` runs before routing. `config.js` `googleClientId` (public). No client secret anywhere.
- supabase-js `detectSessionInUrl: false` so Google's `#access_token` is not taken for a Supabase session.
- New Settings hub (`hubs/settings`, `hidden: true` in registry so not on the hub bar), linked next to Sign out. Will also hold home location (Phase 7) etc.
- Setup guide: `docs/GOOGLE-PHOTOS-SETUP.md`. sw.js VERSION sf-v8.
- Status: built, parked until after the full build (Scott, 07/11/2026). Needs Google Cloud client ID and Edge Function deploy.

### Phase 4 decisions (07/11/2026)
- Life admin stays on its due date (shown overdue) until "Done", which advances it (counted from the original due date so month-ends do not drift). Done on a non-repeating item offers to remove it. Birthdays roll yearly by themselves; 29 Feb shows on 28 Feb in non-leap years.
- Home calendar tile shows finished events dimmed. Today's key dates shown first, marked with an accent dot.
- Quiet key dates line lists up to three, e.g. "MOT overdue by 3 days · Mum's birthday in 5 days · Car tax in 20 days". Shown only after the check-in (same rule as photos). Overdue life admin always included.
- Reminder lead time: one editable number per item (defaults 7 birthdays, 30 life admin) stored as `lead_days` [N, 0].
- "Open in Google Calendar" opens that day (event-specific links are not reliable from an iCal feed).

## Phase 4: Calendar and key dates (complete, 07/11/2026)
- `supabase/functions/calendar-feed`: secret `CALENDAR_FEEDS` (single URL or JSON list), ical.js 2.1.0 via npm, expands recurrence with exceptions/EXDATE, skips cancelled, London day ranges, in-memory feed cache 15 min. Checks user + aal2. Tested locally against a sample feed.
- `core/calendar.js`: client fetch with 15 min localStorage cache and stale fallback, day helpers, event rows, event detail overlay, `renderAgenda()`.
- `core/keydates.js`: CRUD, `nextDate`, `advancedDate`, `upcoming`, `quietLineText`, `keyDateRows`. `core/quiet-lines.js`: provider list for Home quiet lines (Phase 5 adds finance).
- `tiles/calendar`, `hubs/plan` (agenda + key dates with add/edit form overlay). sw.js VERSION sf-v10.
- Setup guide: `docs/CALENDAR-SETUP.md`.

### Phase 5 decisions (07/11/2026)
- Next due: weekly uses `payment_day` as weekday (1 Mon to 7 Sun); monthly uses day of month (31 = last day); quarterly/annual repeat every 3/12 months from `start_date` (required for those), `payment_day` overrides the day if set. No schema change.
- Seed categories (once, `settings.data.categoriesSeeded`): Housing, Council tax, Utilities, Phone & broadband, Insurance, Streaming, Subscriptions, Transport, Loans & credit, Savings, Other. Editable in "Manage categories".
- Quiet finance line has no amounts, e.g. "2 payments due this week · Sky cancel-by in 3 days · 1 more renewal". Shown after check-in, before the key dates line.
- Cancel-by = end/renewal date minus parsed notice period ("30 days", "1 month", "2 weeks"); included in 30-day alerts. Unclear notice text gives no cancel-by.
- Save is blocked if a text field looks like a sort code (nn-nn-nn) or a Luhn-valid 13 to 19 digit card number, or the bank field contains numbers. Long customer references are allowed.

## Phase 5: Money part 1 (complete, 07/11/2026)
- `core/money.js`: categories (seeded), payments CRUD, `nextDue`, `cancelBy`, `dueSoon`, `renewalsSoon`, `quietFinanceText`, `sensitiveNumberWarning`. Date maths tested locally.
- `hubs/money/index.js`: overview (next 7 days with amounts, 30-day renewals/cancel-by highlighted), payments list with category filter chips, detail overlay, add/edit form, categories manager. No monthly outgoings total.
- `core/quiet-lines.js`: finance provider added. sw.js VERSION sf-v11.

### Phase 6 decisions (07/11/2026)
- Pay period: from one actual payday up to the day before the next. Paydays every 28 days from 13/11/2026; bank holiday rule in `settings.data.pay.holidayRule` (after | before); overrides in `payday_overrides`.
- Usual salary is learned from the last salary payment (`settings.data.money.lastSalary`), seeded once by Scott. Salary = employer credit on an actual payday within 15% of it; any other employer credit = Expenses repaid. Employer pattern in `settings.data.money.employerPattern`.
- Recurring payment match: all provider words (3+ letters) in the description and amount within 10%.
- Savings category outgoings are excluded from Spending and shown as "Saved". Left over = income - spending - saved.
- Added `kind = 'transfer'` (Transfer, ignored) for moves between own accounts; credits can be income, salary, expenses_repaid or transfer.
- Merchant rules created from the review screen ("Remember for", default first two words of the normalised description) and applied straight away to other waiting transactions.
- Dedupe key: date | amount | balance | normalised description, unique per user; import upserts with ignore duplicates.

## Phase 6: Money part 2 (built, awaiting Scott's test; parser provisional)
- `core/payschedule.js`: bank holidays (gov.uk, cached 30 days, fallback list 2026 to 2027), paydays, `payPeriod`, `isPayday`, overrides. Tested locally.
- `core/statement.js`: PapaParse 5.7.0 (+esm), `parseStatement` (finds columns by name; sort code and account number never read), `classify`, `importStatement`, transactions, `addRule`, `summarise`, `expensesTotals`. Tested locally with a synthetic Lloyds file.
- `hubs/money`: tabs Overview | Payments | Spending | Pay & import. `import.js` (paydays with Change, holiday rule, import, review, income settings). `spending.js` (P&L pay period / calendar month with prev/next, Chart.js 4.6.1 horizontal bar by category, expenses tracker, transaction list with edit overlay), loaded on demand. Overview shows the import reminder banner when no import in 30 days.
- sw.js VERSION sf-v13.

## Next: Phase 7 (Morning music)
Spotify connection, playlist setup, home detection, Sonos playback, fallbacks and reconnect prompt. Needs Scott's Spotify developer app and 10 playlist links with mood tags.
