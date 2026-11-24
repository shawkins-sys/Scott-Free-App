# Calm Home: agreed plan (24/11/2026)

Status: designed with Scott and signed off; not built. Build in a new chat, in the three phases below, and stop after each phase for Scott to check. The bottom bar is already built (sf-v98: icons only, slim glass bar).

Scott: "The current home page was a good start template but the calm design looks another level."

## Decisions (all confirmed by Scott)

**Where:** phone only. This includes the fold inner screen, because `isPhoneDevice()` counts any user agent containing "Mobi" as a phone. The wall tablet and the computer keep the tile grid and the photo frame, unchanged.

**Tile grid:** kept. A new switch in Settings, "Home style: Calm / Tiles", applies to the phone only and defaults to Calm.

**Check-in:** the same gate as now. Nothing opens until the day's check-in is done (no exceptions). Restyle it to match the calm look. After the check-in, Home shows a small "Checked in" mark under the phrase.

**Page layout, top to bottom** (the background art leads, with its main detail at the bottom):

1. Greeting in the serif voice, changing with the time of day: "Good morning", "Good afternoon" or "Good evening", then ", Scott". Use the existing `greeting()` in `core/date.js`.
2. Date, small and muted.
3. Daily phrase in serif.
4. A "Checked in" mark.
5. **A large rounded photo card** in the middle (about 4:3, 20px corners) showing the current Google Photos slideshow photo with its fade or slow zoom.
   - Tapping it opens the full-screen slideshow.
   - It reuses the Photos tile code (`tiles/photos/index.js`: `swapIn`, `slideshowFrom`, `applySlideshow`, and the phone slideshow settings).
   - Google Photos is linked, so there is no empty-state box. If the photos fail to load, hide the card and let the art show.
6. A flexible gap.
7. **Up next**, shown only when needed:
   - It shows key dates for today or tomorrow, from `core/keydates.js`. Scott adds reminders to Key dates, and they pop up here.
   - Timers are not needed: Scott only uses timers on the tablet.
   - The card is hidden when nothing is due.
   - If more than one item is due, they go in one card, not several.
   - Glass style, the same as the card row.
8. **A glass card row** that swipes sideways. The cards are small squares (about 104px), with about 2.5 visible so it's clear the row scrolls, and they snap into place when you scroll. In order:
   - **Weather:** temperature plus a short line (for example "Rain 3pm"). Tapping it opens the full forecast.
   - **Music:** the current or default playlist. Tapping it plays or pauses.
   - **Lights:** room name. Tapping it switches on or off; a long press opens the scenes.
   - **Calendar:** just a calendar logo and the word "Calendar". Tapping it opens the Google Calendar app (link to `https://calendar.google.com`, which opens the app if it's installed, otherwise the website). Scott barely uses the in-app calendar, because his work calendar can't be added due to Google restrictions. Calm Home must not load calendar events on the phone; that also speeds up loading.
9. Bottom bar (already built).

**Removed from calm Home:** the separate timer line (`#timer-slot`) and the quiet line pill (`#quiet-lines`). Up next covers key dates. Both stay on the tile layout and the wall.

**Glass style:** cards use `color-mix(in srgb, var(--surface-2) 62%, transparent)` with a backdrop blur, the same as `#hubbar`, so the bottom of the art shows through. Check that text stays readable on every scene, by day and by night.

## Build phases

**Phase 1: switch and layout.**
- Add `settings.data.homeStyle` (`'calm'` or `'tiles'`), plus a local copy on the device for a fast start.
- Add the Settings switch, shown only on the phone.
- In `core/app.js`, when on a phone with Calm chosen, render the calm layout instead of the grid (`core/grid.js`): greeting, date, phrase, Checked in, and the photo card that opens the slideshow.
- Restyle the check-in gate to match.
- Bump `sw.js` VERSION, and add any new file (for example `core/calm.js`) to SHELL.

**Phase 2: card row.**
- The four cards and what each does when tapped.
- Reuse the logic from the weather, music and lights tiles, but not their full tile markup. Factor the small shared pieces out of the tiles if needed, without changing how the tiles behave on the wall.
- The Calendar card opens Google Calendar.

**Phase 3: Up next and polish.**
- Up next for key dates today or tomorrow.
- Remove the timer and quiet lines on calm Home.
- Playwright tests in light and dark mode, on several scenes and at the fold's inner screen size.
- Update `docs/PROGRESS.md` and `docs/HANDOVER.md`, and mirror them to the Project.

## Notes for the builder

- The Home markup is in `core/app.js` around lines 105 to 130 (`.greeting`, `#phrase-slot`, `#checkin-slot`, `#timer-slot`, `#quiet-lines`, then the grid).
- Keep the standing rules:
  - no em dashes anywhere in the app
  - UK English
  - DD/MM/YYYY dates
  - Europe/London time
  - no secrets in the front end
  - everything waits for the check-in
- Mockups v1 and v2 were drawn in the chat of 24/11/2026. v2 is the agreed one: art at the bottom, photo in the middle, glass row over the art.
