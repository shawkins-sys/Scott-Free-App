# Morning page setup

The Morning page (bottom bar, where Money was) gets everything from one Supabase Edge Function, `morning`. News, One good thing and On this day work without any setup once the function is deployed. Football needs a free token.

## 1. Football token (free)
1. Register at https://www.football-data.org/client/register (free plan).
2. Your API token arrives by email. Keep it private: it goes only into Supabase, never into the app's code.

## 2. Add the token to Supabase
1. Supabase dashboard, your project, **Edge Functions**, **Secrets** (or Project Settings, Edge Functions).
2. Add a secret named `FOOTBALL_DATA_TOKEN` with the token as its value. Save.

## 3. Deploy the function
1. **Edge Functions**, **Deploy a new function**, **Via Editor**.
2. Paste the whole of `supabase/functions/morning/index.ts` from the repo (raw link: https://raw.githubusercontent.com/shawkins-sys/Scott-Free-App/main/supabase/functions/morning/index.ts).
3. Name it exactly `morning` and deploy.
4. Open the function, **Details**, turn **Verify JWT** off and save (the function checks your sign-in and MFA itself, like the others).

## What it uses
- Football: football-data.org free tier (10 calls a minute; results are slightly delayed, which suits results and fixtures). The function calls it at most once every 3 hours.
- News: BBC and Guardian RSS feeds for Tech and AI and for Man Utd, checked every 30 minutes. Heavy stories (deaths, war, crashes and similar) are filtered out. Feed list: `TOPICS` at the top of the function.
- One good thing: Positive News RSS feed.
- On this day: Wikipedia's "On this day" feed.

## Changing things
- Sections shown: Settings, Daily routine, Morning page.
- Team: `TEAM_ID` in the function (66 is Manchester United on football-data.org) and the Man Utd feeds in `TOPICS`.
