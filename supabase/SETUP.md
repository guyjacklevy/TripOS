# TripOS × Supabase — setup

Auth + a personal database, one time. ~10 minutes. The site already works
without this (no-auth mode) — these steps turn on login and per-user data.

## What only YOU can do (needs your account)

1. **Create the project**
   - Go to https://supabase.com → sign in with GitHub → **New project**.
   - Name it `tripos`, pick a region near your users, set a DB password (save it).

2. **Create the tables**
   - Left sidebar → **SQL Editor** → **New query**.
   - Paste the entire contents of [`schema.sql`](./schema.sql) → **Run**.
   - You should see "Success". (Re-running later is safe.)

3. **Grab your two keys**
   - **Project Settings → API**.
   - Copy **Project URL** and the **anon / public** key.
   - Paste them into [`../shared/supabase-config.js`](../shared/supabase-config.js),
     replacing `YOUR_PROJECT_REF` and `YOUR_ANON_PUBLIC_KEY`.
   - ✅ This file is safe to commit — the anon key is a *publishable* browser key,
     protected by Row Level Security. (It is **not** the PLACES_API_KEY.)

4. **Allow your site's login redirect**
   - **Authentication → URL Configuration**.
   - Set **Site URL** to your live domain (e.g. `https://tripos.app`).
   - Under **Redirect URLs** add both:
     - `https://tripos.app/**`
     - `http://localhost:8080/**` (for local testing)
   - Email magic links won't work until the return URL is on this list.

5. *(optional, recommended)* **Turn on your own SMTP**
   - Supabase's built-in email is rate-limited (~3–4/hour) and fine for testing.
   - For real traffic, **Authentication → Emails → SMTP** → plug in Resend/Postmark/etc.

That's it. No servers to run — Supabase is hosted, and the browser talks to it directly.

## What's already wired in code

- `shared/supabase-config.js` — where your keys go.
- `shared/auth.js` — magic-link login, the login modal, and saving each visitor's
  check-in plan into their `trips` row. No-ops safely until keys are present.
- `supabase/schema.sql` — tables (`profiles`, `trips`, `places`, `expenses`,
  `checkins`) with Row Level Security so each user only sees their own data,
  plus a trigger that auto-creates a profile on signup.

## How to confirm it works

1. Fill in the keys, deploy (or run locally).
2. Complete the check-in wizard on `/bali/`, click **Unlock it free**.
3. Enter your email → check inbox → tap the magic link.
4. In Supabase → **Table Editor → trips**, you should see a new row with your
   vibe / duration / budget tier.
