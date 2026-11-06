# Google Photos setup

This lets the slideshow use photos you choose from Google Photos. About 10 minutes. Do it on a computer.

Google no longer lets apps read an album directly, so the app uses Google's Photos Picker: you choose photos (or a whole album) in Settings, and the app saves resized copies (2048px, about 0.3 to 0.6 MB each) to the private `photos` bucket. Choosing again replaces the set. New photos added to the album later appear only when you choose again.

## Part A: Google Cloud (gives the app a client ID)

1. Go to https://console.cloud.google.com and sign in with the Google account that holds your photos.
2. Top bar: project picker, then **New project**. Name it `Scott Free`, then **Create**. Make sure it is selected.
3. Menu: **APIs & Services**, then **Library**. Search for **Photos Picker API**, open it and press **Enable**.
4. Menu: **Google Auth Platform** (may be shown as **OAuth consent screen**), then **Get started**:
   - App name: `Scott Free`. User support email: your email.
   - Audience: **External**.
   - Contact email: your email. Agree, then **Create**.
5. **Audience**, then **Test users**, then **Add users**: add your own Gmail address and save. Leave the app in **Testing**.
6. **Data access**, then **Add or remove scopes**. Under "Manually add scopes" paste:
   `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`
   Press **Add to table**, **Update**, then **Save**.
7. **Clients**, then **Create client**:
   - Application type: **Web application**. Name: `Scott Free web`.
   - Authorised JavaScript origins: `https://shawkins-sys.github.io`
   - Authorised redirect URIs: `https://shawkins-sys.github.io/Scott-Free-App/` (keep the trailing slash)
   - Press **Create**.
8. Copy the **Client ID** (ends in `.apps.googleusercontent.com`). Ignore the client secret: it is not needed and must never go in the repo.
9. Put the Client ID in `config.js` as `googleClientId`, or send it to Claude to add. A client ID is public by design, so it is safe in the public repo.

## Part B: Supabase Edge Function (copies the photos)

Google's photo links cannot be downloaded by a browser, so a small server-side function does the copying.

1. Supabase dashboard, your project, then **Edge Functions**.
2. **Deploy a new function**, then **Via Editor**.
3. Name it exactly `photos-import`.
4. Open `supabase/functions/photos-import/index.ts` in the GitHub repo, press **Raw**, copy everything, and paste it over the example code in the editor.
5. Press **Deploy function**.
6. Nothing else to configure: the function uses Supabase's built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values.

If choosing photos later fails with a sign-in error from the function, open the function's **Details** and turn off **Verify JWT**. The function checks your sign-in and MFA itself.

## Using it

1. Open the app, complete the check-in, then tap **Settings** at the bottom of Home.
2. Tap **Choose photos from Google Photos**. You are sent to Google to sign in.
   - Google will say "Google hasn't verified this app". That is expected for your own app in Testing: tap **Continue**.
3. Back in the app, tap **Open Google Photos**, select your photos (in the picker you can open an album and select all), then tap **Done**.
4. Return to the app. It shows progress while saving, then the slideshow uses the new set.

Videos are skipped. Up to 200 photos per choice.
