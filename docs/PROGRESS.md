# Scott Free: build progress

Brief: `claude/scott-free-build-prompt.md` (v2, with section 14 addendum) in the claude.ai Project. Repo: `shawkins-sys/Scott-Free-App` (public). Live: https://shawkins-sys.github.io/Scott-Free-App/

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
- Statement import: Scott uses PDF statements from the Lloyds app (15/11/2026). Scott runs Money, Pay & import, Check statement on a real PDF and pastes the masked layout (Copy layout) if anything is wrong; also send the employer payer description. Finalise `parseLines()` in `core/statement-pdf.js` and set the employer pattern. Do not ask for the raw statement.
- Check gov.uk bank holidays fetch works from the browser (CORS). If not, move it to an Edge Function (fallback list covers 2026 to 2027).
- Spotify: Client ID into `config.js`, secret `SPOTIFY_CLIENT_ID`, deploy `spotify` (docs/SPOTIFY-SETUP.md).
- Wall display: SQL run 21/11/2026. Scott sets a hub PIN from his phone or PC, then follows the tablet steps in docs/ANDROID-TESTING.md.

## Decisions made
- Home top section is fixed, only content tiles are movable.
- Home date shows friendly form "Friday 6 November". DD/MM/YYYY everywhere else.
- No in-app password reset; reset via Supabase dashboard.
- Possible later: "Add another authenticator" option in Settings.
- (12/11/2026) Grid rows are 18px (was 72px) for finer tile resizing. Tile `defaultSize` stays in 72px blocks and is scaled x4; saved layout items carry `s: 4`, older ones (no `s`) are scaled on load. Minimum tile height 3 rows (54px).

### Phase 2 decisions (06/11/2026)
- Check-in metrics (all 1 to 5, in `checkins.metrics`): mood, sleep, energy, emotional_stress, work_stress, physical. Add more via `METRICS` in `core/wellbeing.js`.
- Rating style: colour dots only, number shown on hover/press. (17/11/2026, Scott) Colours now mean how good the day is: soft red (1) to green (5), `--lvl-1..5` in theme.css. Emotional and work stress are reversed (`reverse: true` in METRICS, `levelOf(key, n)` in core/wellbeing.js), so low stress shows green. Darker number text on levels 3 and 4. Warnings (overdue key dates, money alerts) use their own `--alert` amber. History calendar legend reads 1 (low) to 5 (great). sw.js VERSION sf-v32.
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

### Changes 15/11/2026 (Scott's requests)
- Settings page is collapsible sections (`<details>`), each loaded when first opened: Morning music, Daily phrases, Pay and income, Photos. Music opens itself on return from Spotify; Photos during the Google flow.
- Daily phrase management moved from the Wellbeing hub to Settings (`hubs/settings/phrases.js`).
- Bank holiday rule, employer description and usual salary moved from Money, Pay & import to Settings (`renderPayIncomeSettings` exported from `hubs/money/import.js`). Paydays list with Change stays in Money.
- Wellbeing hub: Today card plus a History month calendar (Monday first). Days with a check-in are coloured by mood (1 blue to 5 amber); tap a past day for a read-only summary; tapping today opens the edit form. `listCheckins(from, to)` in `core/wellbeing.js`.
- Statement import accepts Lloyds PDF (from the app, Scott's normal route) as well as CSV. `core/statement-pdf.js`, loaded only for PDFs: pdf.js 6.5.438 from jsDelivr (module worker via a blob so the cross-origin worker loads), text grouped into lines by y, parser finds the Money In / Money Out / Balance header columns, dates like "03 Nov 26" (date shown once per day is carried forward), type codes stripped, wrapped descriptions joined, balance-only lines complete the row above, brought/carried forward lines skipped. Sign and amount are checked against the running balance. Tested locally with a synthetic two-page Lloyds-style PDF. Note: mixing PDF and CSV imports for the same period may create duplicates because descriptions can differ.
- Check statement tool (Money, Pay & import): reads a PDF on the device and saves nothing; shows rows, money in/out, balance check (each balance = previous + amount); Copy layout gives text positions with letters masked to x and digits to 9, keeping layout words (headings, month names, type codes). `checkPdfStatement`, `maskedLayout` in `core/statement-pdf.js`.
- Rule confirmed by Scott (15/11/2026): everything, Settings included, stays locked until the day's check-in is complete. No exceptions.
- Settings is now on the hub bar on every page (gear icon, 5 buttons); the Settings link at the bottom of Home was removed. Still locked until the check-in like other hubs. Fixed history calendar days losing their mood colour (CSS order).

## Phase 7 part A: Spotify connection (built 12/11/2026, awaiting Scott's Spotify app)
- Decisions: phone fallback shows an "Open in Spotify" button (no auto-open); speaker picked once in Settings from the Spotify device list; music starts from phone check-ins only, and only before 12:00.
- `supabase/functions/spotify`: PKCE (no client secret), secret `SPOTIFY_CLIENT_ID`, tokens in `spotify_auth`, actions connect/status/devices/play/disconnect. Play: transfer (no play), shuffle on, volume 30 on the speaker only, play context, shuffle again. Speaker missing falls back to phone; no phone device returns `open`. invalid_grant clears the token so status shows Reconnect. 6-month expiry from `authorised_at`, warning 14 days before.
- `core/spotify.js`: PKCE start, `captureSpotifyReturn()` (query `code`/`state`, verifier in localStorage), status/devices/play, music settings (`settings.data.music`: speakerId, speakerName, home), geolocation helpers. `hubs/settings/music.js`. `config.js` `spotifyClientId`. Guide `docs/SPOTIFY-SETUP.md`.

## Phase 7 part B: Morning music flow (built 15/11/2026, awaiting Scott's Spotify app)
- `core/music.js`: playlists CRUD (max 10, `playlists.moods`), `playlistId()` (accepts open.spotify.com links incl. /intl-xx/, and spotify: URIs), `pickPlaylist()` (random among playlists tagged with today's mood, else the nearest tagged level, ties random). `startMorningMusic(entry, slot)` runs from `afterCheckin()` (not awaited): phone width only, before 12:00 London, needs a mood-tagged playlist. Not connected: expired shows Reconnect card, otherwise Open in Spotify card. No speaker chosen: phone. Home set + location within 150m: speaker; farther: phone; no location or no home: "Speaker or phone?" card. Results: playing (card, clears after 15 s), open (Open in Spotify button + Not now), reconnect (card). Never a raw error.
- `maybeReconnectPrompt()` on Home after the check-in, at most once a day per device: shows Reconnect when expired or within 14 days.
- Home has `#music-slot` under `#checkin-slot`. Settings, Morning music, Playlists editor: name, link, mood chips 1 to 5, edit/delete, "x of 10".
- sw.js VERSION sf-v22. Logic tested locally (link parsing, mood picking).

### Phase 8 decisions (15/11/2026)
- Trends: one chart, pick the metric (6 ratings + hours slept), 7 / 30 day switch. Patterns need 14+ check-ins.
- Weekly review: missed Sundays are filled in next time the app opens (Past reviews has no gaps). Home card all Sunday after the check-in, hidden once Reviewed.
- Breathing vibration on by default, switch in Settings, Breathing.

## Phase 8 part A: Breathing and trends (built 15/11/2026)
- `core/breathing.js`: full-screen box breathing (4 x 4 s steps, 4 rounds), dot traces a square with the outline filling in, step text, countdown, "Round n of 4", Skip, vibration per step (`settings.data.breathing.vibrate`). Runs in `afterCheckin()` when emotional or work stress is 5, before music; also a Start button in the Wellbeing hub. Checked in headless Chrome (fixed a negative first-frame bug).
- `core/trends.js` (pure, tested): `series()` per day, `patterns()`: mood after 7+ h sleep, energy after exercise, weekday with highest work / emotional stress (gaps of 0.3 / 0.5, groups of 5+ / weekday 3+). `hubs/wellbeing/trends.js`: chips per metric, 7/30 switch, Chart.js line, average line, patterns list.
- sw.js VERSION sf-v24.

## Phase 8 part B: Weekly review (built 15/11/2026)
- `core/weekly.js`: week = Monday to Sunday (`weekStartOf`). `buildSnapshot(ws)`: check-in averages (6 ratings + hours) this week vs last; money (spending and saved this pay period up to the Sunday, expenses owed) loaded via dynamic imports so a CDN failure does not block it; key dates and renewals in the 14 days after the Sunday; next week's calendar (only when built on the Sunday itself). `syncReviews()`: on Sunday upserts this week's snapshot keeping reflection/reviewed; any day fills missing past weeks (back to the first check-in, max 8). `reviewHtml(review, { showMoney })`: `showMoney: false` hides money figures and renewal lines (for the wall display, brief 14.4). `renderWeeklyCard()` on Home (#weekly-slot) after the check-in on Sundays: reflection (saves on change), Mark as reviewed hides it.
- Wellbeing hub: Weekly review card with "This week so far" (built live, not saved) and Past reviews newest first (tap to open).
- Note: backfilled weeks use expenses owed as of the day they were filled in.
- sw.js VERSION sf-v25. Week maths and rendering tested locally.

## Phase 9: Polish (built 15/11/2026)
- Offline: `sw.js` now precaches every hub and tile file; pinned CDN libraries use a stable `sf-cdn` cache kept across releases; VERSION sf-v26. Calm "Offline: showing saved information" pill (`watchConnection()` in `core/app.js`), page refreshes when back online (after sign-in only). Today's check-in is copied to localStorage (`sf-today-checkin`) only after the database returns or confirms it, and is used for the lock when offline. Check-in Done offline keeps answers and explains.
- README rewritten in plain English: daily flow, where each setting lives (table), swap photos, update calendar feed, reconnect Spotify, import a statement, add a tile or hub, release a change (bump VERSION), offline, security.
- `docs/ANDROID-TESTING.md` checklist.
- Smoke-tested in headless Chrome with Supabase and CDN libraries stubbed: sign-in screen renders with no errors; all 35 modules in core, hubs and tiles load and link.

## App lock (added 15/11/2026, Scott's request)
- Decisions: asks on open and after more than 1 minute away; 5 wrong PINs pause entry for 5 minutes (plus "Forgot PIN? Sign out" link); every device (phone fingerprint or PIN, PC PIN or Windows Hello).
- `core/applock.js`: per device in localStorage `sf-lock` ({ salt, hash (PBKDF2-SHA256 150k), credId, fails, pausedUntil }). Fingerprint via WebAuthn platform authenticator with userVerification required (local unlock gate, no server check). First run after sign-in: choose PIN twice, offer fingerprint. `ensureUnlocked()` runs after `requireAuth()` before anything renders; `watchAway()` re-locks after 60 s hidden. Lock screen hides #app, #overlay, #hubbar and breathing. Sign out (Home link, Forgot PIN) clears the device lock. Settings, App lock: Change PIN (confirms current first), fingerprint toggle, Lock now.
- Honest limit told to Scott: a lock screen, not encryption at rest.
- Tested in headless Chrome: setup, mismatch, reopen, 5 wrong PINs pause (right PIN refused during pause), unlock, PIN not stored in plain text; all modules still load. sw.js VERSION sf-v27.

## Section 14 (wall display) plan, agreed 15/11/2026
- New: `core/device.js` (device ID + wall flag in localStorage), `core/hubpin.js` (4 to 6 digit hub PIN, salted PBKDF2 hash in `settings.data.hubPin`, 5 wrong = 5 min pause per device, relock after 2 min idle or leaving the hub), `hubs/settings/wall.js` (wall switch on any device; set/change PIN and "Also protect Wellbeing" only on non-wall devices).
- Changed: `core/grid.js` (third layout `wall`, 12 columns, tiles across the width), `core/app.js` (wall: large clock, Screen Wake Lock re-requested on visible, check-in re-check on load / visible / every 5 min, PIN gate for Money, Settings and optionally Wellbeing, weekly card without money), `core/quiet-lines.js` (no finance line on wall), `tiles/weather` (saved home location, Cheltenham fallback), `core/music.js` (wall always at home: Sonos 30%), `core/theme.css` (larger text, 56px+ targets, higher contrast, no selection or long-press), schema, README, ANDROID-TESTING (tablet section).
- Scott runs one SQL line to allow `wall` in `layouts.device`.
- Decisions: no app lock on wall devices; Settings needs the hub PIN on the wall (same PIN as Money); Plan stays open. Before a hub PIN is set, Money and Settings on the wall say to set one from the phone or PC.


## Section 14 part A: wall mode (built 15/11/2026)
- SQL given to Scott (run once): `alter table public.layouts drop constraint if exists layouts_device_check; alter table public.layouts add constraint layouts_device_check check (device in ('phone', 'desktop', 'wall'));` schema.sql updated to match.
- `core/device.js`: `deviceId()`, `isWall()`, `setWall()` (localStorage `sf-device-id`, `sf-wall`).
- `core/grid.js`: `currentDevice()` returns `wall` first; 12 columns; WALL_DEFAULTS photos/calendar/weather 4 wide x 6 blocks side by side.
- `core/wall.js`: `startWallMode()` adds body.wall, blocks contextmenu (except inputs), clock in `#wall-clock` (HH:MM London), Screen Wake Lock re-requested on visible, check-in recheck on visible and every 5 min (re-routes if the status changed). `core/app.js`: wall skips the app lock and starts wall mode; clock in the Home header on wall.
- `core/music.js`: wall counts as a music device and always targets the speaker (no geolocation). `tiles/weather`: wall uses the saved home location (label "Home"), else Cheltenham.
- `hubs/settings/wall.js`: "This device is a wall display" switch with confirm, reloads to apply. Settings section "Wall display".
- CSS body.wall: 19px base, 4.5rem clock, larger greeting/date/phrase in full text colour, 56px+ targets, 60px check-in dots, check-in in two columns, larger hub bar (76px), no selection or long-press callout. Checked in headless Chrome at 1280x800.
- sw.js VERSION sf-v28.

- (16/11/2026) Box breathing keeps the screen on (Screen Wake Lock) for the whole exercise, re-requested if the app is hidden and shown again, released on finish or Skip. Checked in headless Chrome. sw.js VERSION sf-v29.

## Section 14 part B: privacy and hub PIN (built 16/11/2026)
- `core/hubpin.js`: `settings.data.hubPin` { salt, hash (PBKDF2-SHA256 150k), protectWellbeing }. `setHubPin` / `setProtectWellbeing` refuse on wall devices. `needsPin(hubId)`: wall only; money and settings always, wellbeing if protectWellbeing. One hub unlocked at a time; `noteRoute()` on every route change relocks when leaving; idle timer 2 min reset by pointerdown/keydown/scroll/wheel, then `setRelockHandler` re-routes. Wrong attempts per device in localStorage `sf-hubpin-fails`; 5 wrong = 5 min pause. `renderPinGate()` shows a keypad (4 to 6 digits, OK) inside the hub area; no PIN set shows "Set a hub PIN in Settings, Wall display, on your phone or PC first."
- `core/app.js`: PIN gate in `renderHub()` after the check-in lock; weekly card `showMoney: !isWall()`. `core/quiet-lines.js`: finance provider returns null on wall. Wellbeing hub weekly views hide money on wall.
- `hubs/settings/wall.js`: hub PIN set/change form and "Also protect Wellbeing" on non-wall devices; read-only note on the wall.
- README wall section and settings table; `docs/ANDROID-TESTING.md` tablet section (14.5).
- Tested in headless Chrome with a stateful Supabase stub: PIN set on normal device and refused on wall, hash only stored, Money gated, wrong PIN count, right PIN opens, leaving relocks, Settings gated, Plan and Wellbeing open, no finance quiet line, 2 min idle relock with touch resetting the timer (simulated clock). All 40 modules load. sw.js VERSION sf-v30.

- (16/11/2026, Scott) Money is fully hidden on the wall display: not on the hub bar, `#/hub/money` redirects Home, `needsPin` no longer lists money. Settings on the wall hides Pay and income and App lock; the hub PIN now guards Settings (and Wellbeing if ticked). Tested in headless Chrome. sw.js VERSION sf-v31.

## Section 14 complete. Remaining: the "Before finishing" list (Scott's setup steps).

## Shopping list (built 17/11/2026)
- Decisions (Scott): section inside the Plan hub (no new hub or tile); multiple named lists; items have name, quantity and notes; ticked items drop to a "Done" group with "Clear ticked"; staples per list; visible and editable on the wall display (no PIN); add and tick offline with sync later, latest change wins; single user for now, family sharing planned later.
- SQL: `supabase/shopping.sql` (run once, safe to re-run), also folded into `schema.sql`. Tables `shopping_lists`, `shopping_items`, `shopping_staples`, RLS `owner_mfa`. Items and staples hang off `list_id` (cascade delete) so sharing can later be added with a `shopping_list_members` table and new policies on these three tables only. Flag for later: other family accounts and the aal2 (MFA) requirement.
- `core/shopping.js`: local copy in localStorage `sf-shop-cache`, outbox `sf-shop-outbox`. Every change applies locally, queues an upsert or delete (coalesced per row) and flushes in order. Network failures wait; a server refusal retries 5 times then is dropped so the queue cannot jam. `refresh()` only replaces the local copy once the outbox is empty. Auto refresh on `online` and when the page becomes visible. Device-generated UUIDs. Staple tap: skips if already on the list, unticks if ticked.
- `hubs/plan/shopping.js`: Shopping card below Key dates. List tabs, New list, Rename, Delete. Add box (name and qty) keeps focus between adds. Tick circle or tap the row to tick. Edit overlay: name, qty, notes, Save as staple, Delete. Staple chips with Manage (tap to remove). "X changes waiting to sync" line. Last list remembered in `sf-shop-list`. 56px ticks on the wall.
- Tested in headless Chrome with a Supabase stub: add, focus kept, tick, staple save, staple untick and duplicate message, offline queue (2 pending) then sync on reconnect, clear ticked on server, second list, local persistence. No console errors. Light, dark and wall checked.
- sw.js VERSION sf-v33 (adds core/shopping.js and hubs/plan/shopping.js to the precache).

## Habit questions in the check-in (built 21/11/2026)
- Decisions (Scott): habits about yesterday, required; answer scale; managed in Settings; patterns need 14 check-ins and at least 5 days with and 5 without the habit. Two-answer habits show Yes first, like Exercise.
- Defaults: Alcohol (None / 1 to 2 drinks / 3 or more), Social media (None / A bit / Too much), Caffeine after 2pm (No / Yes), Screens in bed (None / Under 30 min / 30 min or more).
- SQL: `supabase/habits.sql` adds `checkins.habits` jsonb { key: answer index }, index 0 = did not. Folded into `schema.sql`. `saveCheckin` retries without habits if the column is missing, so the lock cannot get stuck.
- `core/habits.js`: definitions in `settings.data.habits` (defaults if unset), cached in localStorage `sf-habits` for offline check-ins. Keys never reused.
- `core/checkin.js`: "Yesterday" section, Done needs every active habit. `hubs/settings/habits.js`: Settings, Habits: add (2 or 3 answers), edit, move up, turn off (history kept).
- `core/trends.js` `habitPatterns()`: per habit, the clearest difference in mood, sleep quality, energy (0.3+) or hours slept (0.5+ h) on days after the habit vs not. Shown under "Habits" in Wellbeing trends.
- Tested in headless Chrome (check-in lock, save without column, Settings add and turn off) and with sample data in Node. sw.js VERSION sf-v34.

- (21/11/2026) Scott ran the shopping, habits and wall SQL in Supabase. Pushed live as sf-v34.
