# Android test checklist

Use Chrome on the phone with the app installed (Add to Home screen). After any update, close the app fully (swipe it away from recent apps) and reopen it.

## Install and sign-in
- [ ] Opens full screen from the home screen icon, no browser bar.
- [ ] Sign in with password, then the 6-digit authenticator code. Close and reopen: still signed in.

## App lock
- [ ] First open after this update: choose a 4-digit PIN, enter it again, then offered fingerprint. Accept it.
- [ ] Close and reopen: lock screen; fingerprint prompt appears; PIN also works.
- [ ] Switch to another app for under a minute: no lock. Over a minute: lock.
- [ ] 5 wrong PINs: 5 minute pause with a countdown.
- [ ] Settings, App lock: Change PIN, fingerprint off and on, Lock now.

## Morning flow
- [ ] Before the check-in: hub bar icons dimmed; tapping any (including Settings) shows the lock message. No photos, quiet lines or weekly card yet.
- [ ] Check-in: Done stays grey until all six ratings and Exercise are set. Hours slept shows red below 7 or above 8.
- [ ] After Done: hubs unlock, phrase appears, photos load.
- [ ] Stress rating 5: box breathing runs (dot round the square, countdown, Round n of 4, vibration). Skip works.
- [ ] Music (once Spotify is set up, before 12:00): plays on the Sonos at 30% at home, on the phone away. Location off: "Speaker or phone?". Spotify app closed: "Open in Spotify" card.
- [ ] Do the check-in on the phone, then open the PC: the PC is unlocked too.

## Home
- [ ] Weather shows current, high/low, next 6 hours; expand shows 24 hours and 7 days. Location denied: shows Cheltenham.
- [ ] Calendar (once connected): today's events, finished ones faded, key dates with a blue dot. Tap an event for details.
- [ ] Edit: tiles move and resize in small steps; layout is still there after reopening. Phone and desktop layouts are separate.
- [ ] Quiet lines appear only when something is due, and open the right hub.
- [ ] Sunday: weekly review card; add a reflection, Mark as reviewed hides it.

## Hubs
- [ ] Wellbeing: Today with Edit; History calendar coloured by mood, tap a past day; Trends chips and 7/30 switch; Box breathing Start; Weekly review, This week so far and Past reviews.
- [ ] Plan: next 7 days agenda; add a birthday and a life admin item; Done moves life admin to its next date.
- [ ] Money: add a payment; it shows in Next 7 days and the quiet line. Typing 12-34-56 in Notes blocks saving.
- [ ] Money, Pay & import: paydays (13/11/2026, 11/12/2026...); Check statement on a Lloyds PDF (balance check "All add up"); Import statement; Review list; Spending tab totals and chart.
- [ ] Settings: each section opens; phrases, breathing switch, pay and income, music, photos.

## Offline
- [ ] Turn on airplane mode and reopen the app: it opens, shows "Offline: showing saved information", last weather and photos still show, hubs stay unlocked if today's check-in was done.
- [ ] Turn airplane mode off: the note disappears and the page refreshes.

## Midnight
- [ ] Leave the app open overnight: next morning it asks for the new check-in and hubs are locked again.

## Shopping list
1. Open Plan and scroll to Shopping. Tap "Create list" (pre-filled "Weekly shop").
2. Add a few items with and without a quantity. The keyboard should stay open between adds.
3. Tap an item to tick it: it moves to "Done". Tap "Staple" on it, then tap its chip: it moves back up.
4. Tap Edit on an item, add a note, save. Try "New list", switch tabs, rename and delete a list.
5. Turn on aeroplane mode, add and tick items: "changes waiting to sync" shows. Turn it off: the line clears. Check the same items appear on the PC or wall display.
6. On the wall display, open Plan and add or tick an item. The list refreshes on the phone when you reopen the app.

## Wall display (tablet), brief 14.5
Before you start: run the one-off SQL line in Supabase (SQL Editor) so the wall layout can be saved:
`alter table public.layouts drop constraint if exists layouts_device_check; alter table public.layouts add constraint layouts_device_check check (device in ('phone', 'desktop', 'wall'));`

1. **Set the hub PIN first (phone or PC)** (it protects Settings on the wall, and Wellbeing if ticked): Settings, Wall display, enter a 4 to 6 digit PIN twice, Set PIN. Leave "Also protect Wellbeing" off for now.
2. **Turn on wall mode (tablet):** open the app in Chrome on the tablet and install it (Add to Home screen). Sign in (password, then authenticator code), complete the check-in if it is a new day, then Settings, Wall display, tick "This device is a wall display" and confirm. The app reloads with a big clock and no app lock.
   - [ ] Large clock, larger greeting, date and phrase; bottom bar larger.
   - [ ] Screen does not dim or sleep while the app is open.
   - [ ] Long-pressing a tile shows no menu and selects no text.
3. **Edit the wall layout:** tap Edit, drag and resize tiles across the width, tap Done. Reopen the app on the tablet: layout kept. Check the phone layout is unchanged.
4. **PIN flow (tablet):**
   - [ ] No Money button on the bottom bar (Home, Wellbeing, Plan, Settings only).
   - [ ] Tap Settings: PIN pad. A wrong PIN says how many tries are left. The right PIN opens Settings, without Pay and income or App lock.
   - [ ] Leave Settings (Home) and tap Settings again: asks for the PIN again.
   - [ ] Open Settings, put the tablet down for over 2 minutes: it locks again.
   - [ ] 5 wrong PINs: 5 minute pause with a countdown.
   - [ ] Plan opens without the PIN.
   - [ ] On the phone, tick "Also protect Wellbeing". On the tablet, Wellbeing now asks for the PIN.
   - [ ] On the tablet, Settings, Wall display shows the PIN cannot be changed there.
5. **Check-in sync (next morning):** leave the tablet on Home showing the check-in. Do the check-in on your phone.
   - [ ] Tablet unlocks within 5 minutes, or straight away when you touch the screen or wake it.
6. **Money figures hidden (tablet):**
   - [ ] No finance line on Home (the phone still shows it when something is due).
   - [ ] On a Sunday, the weekly review card shows check-in averages and key dates but no spending, expenses owed or renewal lines. Wellbeing, Past reviews also hide them.
7. **Home behaviour (tablet):**
   - [ ] Weather label says "Home" (needs the home location set in Settings, Morning music), otherwise Cheltenham.
   - [ ] Morning check-in on the tablet before 12:00 plays music on the Sonos at 30% (once Spotify is set up).
