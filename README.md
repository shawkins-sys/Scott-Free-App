# Scott Hub

(Renamed from Scott Free on 21/11/2026. The repo, web address, storage keys and the Spotify and Google developer app names still use the old name; that is expected.)

A calm personal life hub for Scott: installed on an Android phone as an app, and used in a desktop browser. Plain HTML, CSS and JavaScript on GitHub Pages, with Supabase behind it.

Live: https://shawkins-sys.github.io/Scott-Free-App/

**This repo is public.** Only the Supabase URL and publishable (anon) key, and the Google and Spotify client IDs, may ever be committed. Those are public by design. Everything secret (calendar feed address, Spotify tokens) lives in Supabase.

---

## How the app works day to day

- **Home** shows the greeting, today's phrase, the morning check-in, then tiles (weather, photos, calendar) and quiet lines for money and key dates.
- **App lock:** each device asks for a 4-digit PIN (or fingerprint, where available) when the app opens and when you come back after more than a minute. 5 wrong PINs pause entry for 5 minutes. "Forgot PIN? Sign out" on the lock screen signs you out; sign in again with password and authenticator code, then choose a new PIN.
- **Everything is locked until the day's check-in is done**, including Settings. The day resets at midnight (UK time). The check-in is stored in the database, so doing it on the phone unlocks the PC too.
- After the check-in: the daily phrase appears, box breathing runs if either stress rating is 5, then morning music starts (phone only, before 12:00).
- **Sundays:** a weekly review card appears on Home after the check-in.
- **Bottom bar:** Home, Money, Wellbeing, Plan, Settings.

## Wall display (tablet or screen at home)
- On the tablet: sign in, do or wait for the check-in, then Settings, Wall display, tick **This device is a wall display**. Only that device changes.
- The wall has its own layout (Edit works as normal), a large clock, larger text and buttons, and keeps the screen awake while the app is open. It has no app lock.
- Weather uses your saved home location. Morning music starts from the wall display only when Settings, Morning music is set to Speaker (it then always uses the speaker).
- Privacy on the wall: **the Money hub is not on the wall at all** (Money is for your phone and PC). No finance line on Home, no money figures in the weekly review, and no Pay and income settings. **Settings needs the hub PIN** (Wellbeing too if you tick "Also protect Wellbeing"). After the PIN, the hub relocks after 2 minutes without a touch or as soon as you leave it. 5 wrong PINs pause entry for 5 minutes. Plan stays open.
- The hub PIN (4 to 6 digits) is set or changed only from your phone or PC: Settings, Wall display. Only a scrambled (hashed) copy is stored.
- The check-in is shared: doing it on your phone unlocks the wall within 5 minutes, or straight away when the wall screen is touched or woken.
- To turn wall mode off, open Settings on the wall (needs the hub PIN) and untick the switch.

## Where each setting lives

| What | Where |
| --- | --- |
| Daily phrases (add, edit, pin, tough days) | Settings, Daily phrases |
| Spotify connect / reconnect, plays on (phone or speaker), speaker, home location, playlists | Settings, Morning music |
| App lock: change PIN, fingerprint on/off, lock now (per device) | Settings, App lock |
| Wall display switch (per device); hub PIN and "Also protect Wellbeing" (phone or PC only) | Settings, Wall display |
| Breathing vibration on or off | Settings, Breathing |
| Bank holiday rule, employer description, usual salary | Settings, Pay and income |
| Slideshow photos from Google Photos | Settings, Photos |
| Change a single payday | Money, Pay & import, Paydays, Change |
| Payment categories | Money, Payments, Manage categories |
| Key dates (birthdays, MOT, car tax...) | Plan, Key dates |
| Tile positions and sizes | Home, Edit (phone and desktop are saved separately) |
| Edit today's check-in | Wellbeing, Today |
| App name, timezone, phone/desktop breakpoint | `config.js` |
| Calendar feed address | Supabase secret `CALENDAR_FEEDS` |
| Password reset | Supabase dashboard, Authentication, Users |

## How to...

### Swap the photos
- **From Google Photos:** Settings, Photos, **Choose photos from Google Photos**. Pick an album's photos and tap Done. Choosing again replaces the whole set. (One-off setup: `docs/GOOGLE-PHOTOS-SETUP.md`.)
- **By hand:** Supabase dashboard, Storage, bucket `photos`. Upload JPG, PNG or WebP files to the top level (not a folder). HEIC is not supported. Delete old ones there too.
- The phone keeps a copy of each photo after it is first shown. Deleted or replaced photos are cleared from the phone automatically.

### Update the calendar feed address
1. Google Calendar on a computer: Settings, your calendar, Integrate calendar, copy **Secret address in iCal format**.
2. Supabase: Edge Functions, Secrets, edit `CALENDAR_FEEDS` and paste the new address. Save.
3. It shows in the app within 15 minutes.

To add a second calendar, set `CALENDAR_FEEDS` to a list: `[{"id":"personal","name":"Personal","url":"https://..."},{"id":"other","name":"Other","url":"https://..."}]`. Full guide: `docs/CALENDAR-SETUP.md`.

### Reconnect Spotify
Spotify ends the connection six months after you approve it. The app shows a **Reconnect Spotify** card on Home two weeks before, and again once it has expired. Tap it (or Settings, Morning music, Reconnect Spotify) and approve. Setup guide: `docs/SPOTIFY-SETUP.md`.

### Import a bank statement
In the Lloyds app, download a statement PDF. In Scott Hub: Money, Pay & import, **Import statement**, choose the PDF. Importing the same period twice is safe. Then confirm anything listed under **Review**. **Check statement** reads a PDF and shows what would be imported without saving anything.

### Add a new tile
1. Copy `tiles/weather/` to a new folder, e.g. `tiles/quotes/`.
2. In `tiles/quotes/index.js` change `id` and `title`, set `defaultSize` (phone width 1 to 4, desktop 1 to 12; height in blocks of about 72px), and write `render(container)` (the tile) and `renderExpanded(container)` (the full screen view).
3. Add one line to the `tiles` list in `registry.js`: `{ id: 'quotes', path: './tiles/quotes/index.js' },`
4. Add `'./tiles/quotes/index.js',` to the `SHELL` list in `sw.js` so it works offline, and bump `VERSION` (see below).

### Add a new hub
1. Copy `hubs/plan/` to e.g. `hubs/home-move/`, change `id` and `title`, and write `render(container)`.
2. Add one line to the `hubs` list in `registry.js`: `{ id: 'home-move', title: 'Move', icon: 'plan', path: './hubs/home-move/index.js' },` (icons live in `core/icons.js`).
3. Add the file to `SHELL` in `sw.js` and bump `VERSION`.

### Release a change
Edit files directly on GitHub and commit to `main`. GitHub Pages goes live in a minute or two. **Each time, bump `VERSION` in `sw.js`** (e.g. `sf-v26` to `sf-v27`) so phones pick up the new files. On the phone, close the app fully and reopen it.

## Offline
The app's own files and libraries are saved on the device, so it opens without a connection and shows an "Offline" note at the top. The last weather forecast, calendar and photos you have seen still show. A check-in already completed today keeps the hubs unlocked. Anything that needs the database (saving, Money figures) waits until you are back online.

## Folders
- `index.html`, `config.js`, `registry.js`, `manifest.webmanifest`, `sw.js` (offline and updates)
- `core/`: app shell, sign-in, grid, theme, and shared logic (check-in, phrases, money, statements, music, breathing, trends, weekly review)
- `hubs/<id>/`: Money, Wellbeing, Plan, Settings
- `tiles/<id>/`: Weather, Photos, Calendar
- `supabase/schema.sql`: tables and security rules. `supabase/functions/`: server-side functions (`calendar-feed`, `spotify`, `photos-import`)
- `docs/`: setup guides (Supabase, Calendar, Spotify, Google Photos), Android test checklist, build progress notes

## Security
- Each device has its own app lock (PIN or fingerprint). The PIN is stored on the device only as a salted hash; the fingerprint never leaves the phone. It is a lock screen rather than encryption: it protects against someone picking up your unlocked phone.
- Sign-in needs your password and an authenticator code. Every table only allows your own account, signed in with the code.
- No bank account numbers, sort codes or card numbers are stored. Statement imports never read those columns, and the payment form blocks anything that looks like one.
- Spotify tokens and the calendar address stay server-side in Supabase.
- A GitHub Action pings Supabase every 3 days so the free project never pauses.
