# Spotify setup (morning music)

About 10 minutes, easiest on a computer. Needs your Spotify Premium account.

## 1. Create your Spotify app

1. Go to https://developer.spotify.com/dashboard and log in with your Spotify account. Accept the developer terms if asked.
2. Press **Create app**:
   - App name: `Scott Free`
   - App description: `Personal morning music`
   - Redirect URI: `https://shawkins-sys.github.io/Scott-Free-App/` (keep the trailing slash), then press **Add**
   - Which API/SDKs: tick **Web API**
   - Agree to the terms and press **Save**.
3. Open the app, then **Settings**. Copy the **Client ID**. You do not need the client secret: the app uses PKCE, which works without it. Never put the secret anywhere.
4. Still in Settings, open **User Management** and add your own name and Spotify email. Development Mode apps only work for listed users (up to five).

## 2. Give the Client ID to the app

The Client ID is public by design, so it is safe in the public repo:
- Put it in `config.js` as `spotifyClientId`, or send it to Claude to add.
- Also save it in Supabase: **Edge Functions**, **Secrets**, add `SPOTIFY_CLIENT_ID` with the same value.

## 3. Deploy the function

1. Supabase dashboard, **Edge Functions**, **Deploy a new function**, **Via Editor**.
2. Name it exactly `spotify`.
3. Open `supabase/functions/spotify/index.ts` in the GitHub repo, press **Raw**, copy everything and paste it over the example code.
4. Press **Deploy function**.

If Settings shows "Not available" and the function logs say "Invalid JWT", open the function's **Details** and turn off **Verify JWT**. The function checks your sign-in and MFA itself.

## 4. Connect in the app

1. Open Scott Free, complete the check-in, then **Settings** at the bottom of Home.
2. **Connect Spotify** and approve. You come back to Settings with "Spotify connected".
3. **Choose speaker**: pick your Sonos One. If it is not listed, play something on it from the Spotify app once, then try again.
4. At home, press **Use my current location as home**.

## Every six months

Spotify now ends the connection six months after you approve it. The app warns you two weeks before, and shows **Reconnect Spotify** once it has expired. Reconnecting takes a few seconds.
