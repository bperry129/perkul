# Deploying Perkul

The repo is the deploy source: `github.com/bperry129/perkul`, branch `main`.
Every push to `main` triggers a new deployment.

---

## Why Vercel (recommended)

Perkul is not a static site. It relies on server-rendered pages, API route
handlers, `middleware.ts`, and httpOnly cookie sessions — because the answer key
and the authoritative timer must live on the server. Vercel is built by the Next.js
team and runs all of that natively with no configuration.

Netlify can host Next.js through an adapter, but it adds a translation layer
around exactly the features Perkul depends on (middleware, cookies, route
handlers). Same free tier, same GitHub auto-deploy, same custom domain support —
just more surface area for adapter-specific bugs. If you prefer Netlify anyway,
it will work; you'll need `@netlify/plugin-nextjs` and should re-run
`npm run smoke` against the deployed URL before trusting it.

---

## 1. Import the repo

1. Go to vercel.com → **Add New… → Project**
2. Install the GitHub app if prompted, pick **bperry129/perkul**
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: **`.`** — leave as is, the repo root is the app root
5. Build command / output: **leave defaults**
6. Do **not** deploy yet — add the environment variables first (step 2)

## 2. Environment variables

Add these under **Settings → Environment Variables**, for Production *and*
Preview. Values come from your Supabase project (Settings → API).

| Variable | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | public, safe in browser |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key | **secret — server only** |
| `NEXT_PUBLIC_SITE_URL` | `https://perkul.com` | used for auth redirects + share links |

> The service role key bypasses all row level security. It is only ever read in
> server code (`src/lib/supabase/admin.ts`, which is `server-only`). Never add it
> to a `NEXT_PUBLIC_*` variable.

Then hit **Deploy**.

## 3. Point Supabase auth at the live domain

In Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://perkul.com`
- **Redirect URLs**: add all of these
  - `https://perkul.com/auth/callback`
  - `https://www.perkul.com/auth/callback`
  - `http://localhost:3000/auth/callback` (keeps local dev working)

Magic links and Google sign-in will fail with a redirect error until this is done.

For Google sign-in: Supabase → **Authentication → Providers → Google**, enable it
and paste a Google OAuth client ID/secret. The authorized redirect URI Google
needs is the one Supabase shows you on that screen
(`https://<project>.supabase.co/auth/v1/callback`).

## 4. Custom domain

Vercel → **Settings → Domains → Add** → `perkul.com`. Vercel will show the DNS
records to create at your registrar (an `A` record for the apex, `CNAME` for
`www`). TLS is issued automatically. Set `www` to redirect to the apex, or the
reverse — just be consistent with `NEXT_PUBLIC_SITE_URL`.

## 5. Post-deploy checklist

Run through this once against the live URL:

- [ ] Homepage shows `PERKUL #001` and a START button
- [ ] START begins the timer and serves round 01 / 10
- [ ] Ten selections produce a score, a time, and per-round explanations
- [ ] `npm run smoke` passes against production:
      `$env:SMOKE_BASE_URL="https://perkul.com"; npm run smoke`
      (it plays one real attempt, then deletes it)
- [ ] View source / network tab during a game: no `is_real`, no fake word,
      no definitions in any payload
- [ ] `/leaderboard` loads
- [ ] Magic-link sign-in works, and an anonymous result gets claimed on signup
- [ ] `/admin` is reachable by your admin account and **rejects** a normal account
- [ ] `/admin` dashboard shows 20 days of runway

## 6. Operating it

- **Create your admin account**: sign up on the live site, then run
  `npm run admin:create -- you@email.com` locally (it talks to the same Supabase
  project). Verify by visiting `/admin`.
- **Content runway**: `/admin` warns when fewer than 7 future games remain. Use
  **Game Bank → Generate Next Bank Prompt**, paste into an AI, then
  **Import Generated Bank**. Imports land as `needs_review` — nothing publishes
  itself.
- **Comparisons**: real player percentages stay hidden until a day has
  `minimum_real_sample_size` (default 100) legitimate completions. Until then use
  the labelled benchmark field, or leave comparisons off. Toggle in
  **Admin → Comparisons**.
- **Before launch day**, decide whether the daily leaderboard is on. With very
  few players a leaderboard that honestly says "4 players today" is fine; a
  percentile claiming "you beat 75%" of 4 people is not, and the sample gate
  already prevents it.

---

## Rotate your keys

The Supabase keys were pasted into a chat window during setup. Before real
players arrive, go to Supabase → **Settings → API → Rotate** the service role
key, then update it in Vercel and in your local `.env.local`. Cheap insurance.

## Local development

See `SETUP.md` for the local loop (`npm install`, `.env.local`, `npm run dev`,
`npm run seed`, `npm test`).
