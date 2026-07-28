# Getting Perkul running — Supabase setup

Follow these in order. Total time: about 5 minutes.

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard>.
2. Click **New project**.
3. Fill in:
   - **Name:** `perkul`
   - **Database Password:** click *Generate a password* and save it in your password
     manager. You will not need it for this app, but you will want it later.
   - **Region:** pick the one closest to you (`East US (North Virginia)` is a good
     default for a US audience).
   - **Plan:** Free is fine.
4. Click **Create new project** and wait ~2 minutes for provisioning.

---

## 2. Run the database migrations

Run every file in `supabase/migrations/` **in filename order**. Today that is
two files:

| Order | File | What it does |
| --- | --- | --- |
| 1 | `20260701000000_init.sql` | The whole schema: tables, indexes, RLS, leaderboard functions, feature flags, benchmark population |
| 2 | `20260728120000_score.sql` | Adds the generated `attempts.score` column and re-points the ranking functions at it |

For each one:

1. In the left sidebar, open **SQL Editor**.
2. Click **New query**.
3. Open the file from this project, select **all** of it, and paste it into the
   editor.
4. Click **Run** (or press Ctrl+Enter).

You should see `Success. No rows returned` each time.

> If you see an error mentioning `already exists`, that script has already been
> run. Both files are safe to re-run.

A fresh `20260701000000_init.sql` already contains the score column, so on a
brand-new project the second file is a no-op — but run it anyway rather than
guessing.

---

## 3. Copy your API keys

1. In the sidebar, open **Project Settings** (the gear) → **API**.
2. You need three values:

| Dashboard label | Goes into `.env.local` as |
| --- | --- |
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` |
| **Project API keys → `anon` `public`** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **Project API keys → `service_role` `secret`** (click *Reveal*) | `SUPABASE_SERVICE_ROLE_KEY` |

3. Open `.env.local` in this project and paste each value after the `=`, with no
   quotes and no spaces. It should end up looking like:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ADMIN_EMAILS=you@example.com
```

**The `service_role` key is a full-access admin credential.** It is only ever
read on the server, and `.env.local` is git-ignored. Never paste it into
client-side code or share it.

---

## 4. Load the 20-day game bank

In a terminal, from the project folder:

```powershell
npm run seed
```

This inserts the lexicon, 20 games (#001–#020, July 28 – August 16 2026), all
200 rounds and 1,000 options, then runs the validator over everything. Expect
output ending in `Seed complete` with `0 errors`.

---

## 5. Turn on email sign-in

1. Sidebar → **Authentication** → **Providers**.
2. **Email** is enabled by default — confirm it is on.
3. While developing, go to **Authentication** → **Providers** → **Email** and
   turn **Confirm email** *off* so magic links work instantly without a mail
   provider. Turn it back on before launch.
4. Sidebar → **Authentication** → **URL Configuration**:
   - **Site URL:** `http://localhost:3000`
   - **Redirect URLs:** add `http://localhost:3000/auth/callback`

Google sign-in is optional and can be added later under the same Providers page;
the login screen shows it automatically once the provider is enabled.

---

## 6. Restart and play

```powershell
npm run dev
```

Open <http://localhost:3000>. You should see **PERKUL #001** with a START
button. The date is resolved from the `America/New_York` calendar date, so game
#001 (July 28 2026) is live today and #002 takes over automatically at midnight
Eastern.

---

## 7. Make yourself an admin

Play or sign in once at <http://localhost:3000/login> so your user exists, then:

```powershell
npm run admin:create -- your@email.com
```

Now <http://localhost:3000/admin> is available: game bank, round editor,
validator, analytics, feature flags, benchmark settings and the QA
simulated-attempt generator.

---

## Troubleshooting

| What you see | What it means |
| --- | --- |
| "Perkul is not connected to Supabase yet" | `.env.local` is empty or still has placeholders. Restart the dev server after editing it. |
| "the Perkul tables do not exist yet" | Step 2 did not run. Re-run the migration SQL. |
| "Perkul cannot reach its database" | URL or service role key is wrong, or the project is still provisioning/paused. |
| "No puzzle today" | Database is connected and seeded, but no **published** game matches today's New York date. Check `/admin/games`. |
| Free-tier project paused | Supabase pauses free projects after inactivity. Open the dashboard and click **Restore**. |
