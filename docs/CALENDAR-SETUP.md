# Calendar setup

The Calendar tile and Plan hub read your personal Google Calendar through its secret iCal address. The address is stored as a Supabase secret, never in the code. About 5 minutes, easiest on a computer.

## 1. Copy the secret address

1. Open https://calendar.google.com on a computer.
2. Gear icon, then **Settings**.
3. Left side, under **Settings for my calendars**, click your personal calendar.
4. Scroll to **Integrate calendar**. Copy **Secret address in iCal format** (ends in `basic.ics`).

Treat it like a password: anyone with it can read your calendar. If it ever leaks, press **Reset** there and update the secret below.

## 2. Save it as a Supabase secret

1. Supabase dashboard, your project, **Edge Functions**, then **Secrets**.
2. Add a secret:
   - Name: `CALENDAR_FEEDS`
   - Value: paste the secret address.
3. Save.

To add another calendar later, change the value to a list:
`[{"id":"personal","name":"Personal","url":"https://...basic.ics"},{"id":"other","name":"Other","url":"https://..."}]`

## 3. Deploy the function

1. **Edge Functions**, **Deploy a new function**, then **Via Editor**.
2. Name it exactly `calendar-feed`.
3. Open `supabase/functions/calendar-feed/index.ts` in the GitHub repo, press **Raw**, copy everything, and paste it over the example code.
4. Press **Deploy function**.

If the tile says "not available" and the function logs show "Invalid JWT", open the function's **Details** and turn off **Verify JWT**. The function checks your sign-in and MFA itself.

## How it behaves

- Shows today plus the next 7 days, including repeating events, all-day events and edits to single occurrences.
- The feed is read at most every 15 minutes. Google itself can take a few hours to update the secret address after you change an event.
- "Open in Google Calendar" opens that day in Google Calendar.
