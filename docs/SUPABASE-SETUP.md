# Supabase setup (one-off, about 15 minutes)

Do these in order. Menu names are as Supabase shows them at the time of writing. If a label has moved, search for it in the dashboard.

## 1. Create the project
1. Sign in at https://supabase.com and click **New project**.
2. Name: `scott-free`. Set a strong database password and save it in your password manager (you won't need it day to day).
3. Region: **London (eu-west-2)**.
4. Plan: Free. Click **Create new project** and wait for it to finish.

## 2. Copy the URL and public key
1. Go to **Project Settings > API** (or **API Keys**).
2. Copy the **Project URL** and the **anon / publishable** key. Either key type works.
3. Send both to Claude, or paste them into `config.js` (`supabaseUrl` and `supabaseAnonKey`).
   These two are safe in a public repo. **Never** copy the `service_role` or secret key anywhere.

## 3. Lock down sign-ups
1. **Authentication > Sign In / Providers**: turn **off** "Allow new users to sign up". Keep **Email** enabled.
2. **Authentication > Users > Add user > Create new user**: enter your email and a strong password, and tick **Auto Confirm User**.

## 4. Check MFA is on
**Authentication > Multi-Factor** (or **MFA**): make sure **TOTP (App Authenticator)** is enabled. It is on by default.

## 5. Set the site address
**Authentication > URL Configuration**:
- Site URL: `https://shawkins-sys.github.io/Scott-Free-App/`
- Add the same address under Redirect URLs.

## 6. Create the database
1. **SQL Editor > New query**.
2. Open `supabase/schema.sql` from the repo, copy all of it, paste it in and click **Run**.
3. You should see "Success. No rows returned". Check **Table Editor** lists the tables, and **Storage** shows a private `photos` bucket.

## 7. Keep-alive secrets (GitHub)
In the GitHub repo: **Settings > Secrets and variables > Actions > New repository secret**. Add:
- `SUPABASE_URL`: the Project URL
- `SUPABASE_ANON_KEY`: the anon / publishable key

Then **Actions > Supabase keep-alive > Run workflow** to test it. A green tick means it works.

## 8. First sign-in
1. Open the app and sign in with the email and password from step 3.
2. Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator or similar) and enter the 6-digit code.
3. From then on you'll enter a code only when you sign in again, for example on a new device or after signing out.
