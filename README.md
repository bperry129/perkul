# Perkul

**Five words. One is fake.**

Perkul is a daily timed vocabulary game. Ten rounds, five words per round, exactly one
fabricated word in each. You get one choice per round, no feedback until the end.
**Most right, fastest, wins** — ranking is a single score, and the clock genuinely counts.

- First game: **July 28, 2026** = Perkul **#210** (`BRAND.firstGameNumber` — launch day
  deliberately does not read "#1")
- Seeded content bank: **20 games / 200 rounds / 1,000 options** (2026-07-28 → 2026-08-16)
- Daily rollover: midnight **America/New_York** (EDT/EST handled automatically, no cron required)

The brand name lives in one place (`src/lib/brand.ts`, overridable with
`NEXT_PUBLIC_BRAND_NAME`). Renaming the product is a one-line change.

---

## 1. Stack

| Concern | Choice |
| --- | --- |
| App | Next.js 14 (App Router, React Server Components) |
| Language | TypeScript (strict) |
| Database | Supabase Postgres + RLS |
| Auth | Supabase Auth (email magic link + Google; Apple ready) |
| Validation | Zod |
| Tests | Vitest |
| Deploy | Vercel |

No UI framework, no animation library, no icon packs, no client-side dictionary calls.
Gameplay ships as one small client component; everything else is server rendered.

---

## 2. Local setup

```bash
cd perkul
npm install
cp .env.example .env.local   # then fill in your Supabase values
```

### 2.1 Create the database

Either paste the migrations into the Supabase SQL editor, or use the CLI:

```bash
# Option A — Supabase CLI (recommended)
supabase link --project-ref <your-project-ref>
supabase db push

# Option B — manual
# Run every file in supabase/migrations/ in filename order, in the SQL editor:
#   20260701000000_init.sql    whole schema
#   20260728120000_score.sql   generated score column + score-ordered ranking
```

`init.sql` creates every table, index, RLS policy, and the security-definer
functions used for leaderboards and aggregate statistics. It also seeds the
feature flags, app settings, and the 6,000-run benchmark version. Both files are
idempotent and safe to re-run. `SETUP.md` walks through it click by click.

### 2.2 Seed the content bank

```bash
npm run seed          # upserts lexicon + 20 daily games, published
npm run seed -- --reset   # deletes seeded games first, then re-imports
npm run seed -- --draft   # import as needs_review instead of published
```

The seeder:

1. builds `lexicon_entries` from the authored content (800+ accepted words),
2. inserts games, rounds and options,
3. runs the full content validator and **refuses to publish anything with errors**.

Validate content without touching the database:

```bash
npm run content:check
```

### 2.3 Run it

```bash
npm run dev     # http://localhost:3000
npm test        # 95 tests
npm run typecheck
npm run build
```

### 2.4 Create an admin

Sign in once through `/login` so the user exists, then:

```bash
npm run admin:create -- you@example.com
```

Or set `ADMIN_EMAILS=you@example.com` in `.env.local` before `npm run seed`.
Admin authorization is enforced server-side in `src/app/admin/layout.tsx` and in every
admin server action — hiding the nav is never the security boundary.

---

## 3. How the day works

`America/New_York` is the only calendar that matters.

```
current NY date  ->  games.active_date  ->  today's published game
```

No scheduled job is needed to flip games; the active game is a date lookup
(`src/lib/games.ts`). DST is handled by resolving the true UTC instant of NY
midnight (`src/lib/time.ts`), which is also what the countdown and streak logic use.

A game must be `published` **and** dated today to be live. Past games are kept
forever and can never receive a new ranked attempt.

---

## 4. Answer security

This is the part that must not leak.

1. `round_options.is_real`, `rounds.fake_option_id`, `intended_decoy_option_id`,
   rationales and definitions live in tables with **no RLS policy for `anon` or
   `authenticated`** — a normal Supabase client gets zero rows, not filtered rows.
2. The browser only ever receives `{ optionId, word, position }` per round during play
   (`src/lib/public-payload.ts` strips everything else).
3. Correctness is computed on the server at completion time. The results API is the
   first moment answer data crosses the wire, and only for a completed attempt.
4. Option order is shuffled deterministically **per attempt** and stored, so
   "today's round 7 answer is #3" is meaningless.
5. No fake word appears in page titles, metadata, share text, or public JSON.

`tests/gameplay.test.ts` asserts the payload shape has no answer keys.

---

## 5. Attempt lifecycle

```
START pressed
  -> POST /api/attempt/start
     creates attempt, records SERVER started_at, stores shuffled order
each selection
  -> POST /api/attempt/answer     (no correctness returned, ever)
tenth selection
  -> POST /api/attempt/complete   (idempotent)
     server completed_at -> authoritative elapsed_ms -> correct_count -> results
```

- Refresh mid-game restores the attempt from the server start timestamp; the timer
  does not reset.
- Completion is idempotent: a retried submit returns the original result and cannot
  rewrite answers.
- Integrity states: `valid`, `suspicious`, `unranked`, `admin_review`. Suspicious
  attempts are flagged, never deleted, and stay out of public ranking.
- One ranked attempt per user (or anonymous session) per game, enforced by partial
  unique indexes — not by localStorage.

Guests play the full game. Signing up afterward claims the anonymous attempt through
a server-side cookie match (`/api/attempt/claim`), not a browser-supplied attempt ID.

---

## 6. Ranking

**Most right, fastest, wins.** Every completed attempt gets one number:

```
score = max(0, correct × 1000 − seconds × 8)
```

Sorting is always:

1. `score DESC`
2. `elapsed_ms ASC`
3. `completed_at ASC`

One correct answer is worth about 125 seconds, so accuracy still dominates any
normal game: a 10/10 in 2:00 (9,040) comfortably beats a 9/10 in 1:00 (8,520).
But time genuinely counts — a 10/10 left open for an hour scores 0 and loses to
that same 9/10. The crossover sits around four minutes, well outside real play.

The formula exists twice and the two copies must stay in step:

| Where | What |
| --- | --- |
| `src/lib/scoring.ts` | `perkulScore()`, `compareRanked()`, and the `CORRECT_POINTS` / `POINTS_PER_SECOND` constants |
| `supabase/migrations/20260728120000_score.sql` | the generated `attempts.score` column that `leaderboard_page()` and `attempt_rank()` order by |

Retuning the accuracy/speed balance is a two-number change in both places.
`tests/scoring.test.ts` asserts the rule; `npm run verify:score` proves the live
database agrees with the TypeScript comparator.

Grades (`A+` … `F`) are cosmetic, accuracy-dominant, and configurable in
Admin → Settings. They never affect ordering.

### 6.1 All-time boards

`/leaderboard/all-time` answers "who is good at this game" rather than "who won
today", on two tabs:

| Tab | Ranks by | Minimum |
| --- | --- | --- |
| **Smartest players** (default) | average `score` per game | 5 completed games |
| **Total points** | sum of `score` across every game played | 1 game |

The average board exists so that playing *well* beats merely playing *often* —
a player who shows up twice a week and scores highly is not buried under a
daily grinder. Like any ratio it is meaningless on a tiny sample, so the 5-game
floor is enforced in code and stated on the page.

Both boards reuse the daily eligibility rules (ranked, completed, integrity
`valid`, opted in) and the same per-game `perkulScore()` — no second scoring
rule exists. Attempts are attributed across days by account, then anonymous
session cookie, then simulated-player name; anything unattributable is left off
rather than merged into one meaningless "Guest" row. Only the best attempt per
player per game counts, so a stray duplicate can never double-count.

| Where | What |
| --- | --- |
| `src/lib/all-time-rank.ts` | pure ordering, tie-breaks and the games-played floor (`MIN_GAMES_FOR_AVERAGE`) |
| `src/lib/all-time.ts` | the aggregate read |
| `tests/all-time.test.ts` | asserts the two ladders rank the same field differently |

Aggregation is done in TypeScript, not SQL, so the score formula stays in one
place and the feature needs no migration. Each game's score is recomputed with
`perkulScore()` rather than read from the generated `attempts.score` column, so
these boards work even on a project where `20260728120000_score.sql` has not
been applied yet. At one game a day this is a single indexed read; if daily
volume grows enough to notice, move it to a materialised view keyed on
`(player, game)`.

---

## 7. Comparisons: real vs benchmark

Admin → Comparisons controls the mode:

| Mode | Behaviour |
| --- | --- |
| `off` | personal results only |
| `real` | real ranked completions, but only past `minimum_real_sample_size` (default 100) |
| `benchmark` | deterministic 6,000-run synthetic field, always labelled |

Below the threshold the product either hides the module or shows
"Estimated top 11% — based on our 6,000-run benchmark field". It never says
"you beat 75% of players" when four people have played. Benchmark ranks are analytic
and seeded, so the same result never drifts between refreshes.

---

## 8. Admin

`/admin` — Dashboard · Game Bank · Create/Import · Lexicon · Players · Attempts ·
Analytics · Comparisons · Feature Flags · Settings.

**Runway.** The dashboard shows days of content remaining and warns loudly under 7 days.

**Content pipeline.**

1. Admin → Game Bank → *Generate Next Bank Prompt*. Pick the number of days; the next
   unused date and game number are computed automatically. The prompt embeds the rules,
   the difficulty curve, the accepted-word policy, every historical fake word, recently
   used real words and decoys, and the exact JSON schema.
2. Copy it, run it through an AI, get JSON back.
3. Admin → *Import Generated Bank*. The import preview reports games, rounds, options,
   new words, validation errors, warnings and historical duplicates before anything is
   written. Imports always land as `needs_review` — never auto-published.
4. Review each round against the quality checklist, fix in the editor, mark Ready,
   then Publish.

**Validator** (`src/lib/validation.ts`) blocks: wrong round/option counts, more or fewer
than one fake, a fake that exists in the accepted lexicon, a reused fake, missing
definitions or rationales, a decoy that isn't real, duplicate words inside a game, and
too many visual-pattern rounds. Soft warnings cover reuse cooldowns (fakes never,
decoys 180 days, real words 60–90 days) and anchor-count quality.

**QA data.** Admin → Attempts generates 100 / 1,000 / 6,000 simulated attempts, all
`is_simulated = true`, excluded from public UI and round statistics, and deletable in
one click.

---

## 9. Project layout

```
supabase/migrations/     schema, indexes, RLS, leaderboard + stats functions
src/lib/                 brand, time, games, attempts, scoring, benchmark,
                         comparison, validation, import-schema, prompt, flags
src/lib/public-payload   the only thing the browser is allowed to see
src/content/             the authored 20-day bank + dev fixture (TOVEN/BRUME)
src/app/                 public pages, /admin, /api route handlers
src/components/          GameClient, ResultsView, Countdown, forms
scripts/                 seed, make-admin, validate-content, smoke, verify-score
tests/                   time, scoring, all-time, gameplay, content
```

---

## 10. Tests

```bash
npm test
```

Covers NY date switching and DST boundaries, 10-round and one-fake enforcement,
one-choice-per-round, accuracy calculation, score-based leaderboard ordering
(including the slow-perfect-game case), the two all-time ladders and the 5-game
floor, first-attempt-ranked and replay-unranked, expired games,
anonymous claiming, answer data never reaching the client, feature flags, the
comparison sample threshold, deterministic benchmark ranking, import validation,
duplicate fake detection, and a full audit of the 200 seeded rounds.

---

## 11. Deploy

1. Push to GitHub and import the repo in Vercel.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (`https://perkul.com`).
3. Run every migration in `supabase/migrations/` (filename order) and
   `npm run seed` against the production project, then `npm run verify:score`.
4. Supabase → Auth → URL Configuration: add `https://perkul.com/auth/callback`.
5. Enable Google in Supabase → Auth → Providers.
6. Promote your admin account, then confirm `/admin` loads, `/` shows the launch game,
   and `/leaderboard/all-time` renders both tabs.

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It is never imported into a client
component; `src/lib/supabase/admin.ts` throws if it is loaded in the browser.

---

## 12. Launch configuration

Daily game ON · accounts optional · guest play ON · signup encouragement ON ·
explanations and definitions ON · sharing ON · real leaderboard ON ·
real population percentages OFF until 100 ranked completions · benchmark comparisons ON ·
practice replay OFF · archive OFF. All of it is toggleable in Admin → Feature Flags.
