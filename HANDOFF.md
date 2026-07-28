# PERKUL — SESSION HANDOFF

**Written:** 2026-07-28 · **Repo:** https://github.com/bperry129/perkul (branch `main`)
**Live:** deployed on Vercel · **DB:** Supabase (seeded, working)

> **How to use this file:** start a new Cline task and paste:
> *"Read `C:\Users\bperr\Desktop\perkul\HANDOFF.md` and continue from the TODO list. Start with item 1."*
> Do not paste the original 100-section spec again — it's summarized where it matters below.

---

## 1. STATE OF THE WORLD

The app is **built, seeded, deployed and playable.** v1 is done. What remains is a
round of revisions the owner requested after seeing it live.

Working and verified end-to-end:

- 20 daily games / 200 rounds / ~800 curated words with definitions and rationales
- Gameplay: START → 10 rounds → one final choice per round → results + explanations
- Server-authoritative timer, shuffled option order per attempt, no answer leakage
  before completion (verified by `scripts/smoke.ts`)
- Guest play, magic-link + Google auth, anonymous attempt claiming
- Full admin area: game bank, editor, validator, lexicon, analytics, flags,
  comparisons, prompt generator, JSON import, simulated-attempt QA tooling
- Leaderboard, benchmark field, grades, streaks, sharing, feature flags

**Read `README.md` for architecture and `DEPLOY.md` for the deploy runbook.**

---

## 2. UNCOMMITTED WORK IN THE TREE — READ THIS FIRST

`git status` is **dirty**. Three files were edited and **never committed or pushed.**
Production is running the last pushed commit (`1417ad8`) and is unaffected.

| File | Change |
|---|---|
| `src/lib/brand.ts` | New tagline/subline/cadence copy + `firstGameNumber: 210` |
| `src/lib/scoring.ts` | New `perkulScore()` + `compareRanked()` now ranks by score |
| `src/app/globals.css` | New plum/gold palette replacing orange |

**The tree is intentionally inconsistent right now.** Two known consequences:

1. **`npm test` FAILS.** `tests/scoring.test.ts` and `tests/gameplay.test.ts` assert
   the OLD rule ("a 10/10 always beats a 9/10 regardless of time"). The owner has
   deliberately reversed that rule. These assertions must be **rewritten, not
   reverted**. Failures here are expected until item 2 below is done.
2. **The new score formula is not live.** Ranking is ordered in SQL, so editing the
   TypeScript comparator alone does not move the leaderboard. Needs the migration in
   item 1 below.

Do not `git checkout` these files. Build on them.

---

## 3. THE ONE IMPORTANT DESIGN DECISION

The original spec (§5) said accuracy is absolute: *"A 10/10 always beats a 9/10."*
Acceptance criterion #35 required proving it.

**The owner has reversed this.** Their reasoning: a 10/10 taking an hour should not
beat a 9/10 taking a minute. Time must genuinely count.

Implemented formula (in `src/lib/scoring.ts`, already written):

```
score = max(0, correct × 1000 − seconds × 8)
```

One correct answer ≈ 125 seconds. Consequences, all intended:

- 10/10 in 2:00 (9040) **beats** 9/10 in 1:00 (8520) — accuracy still dominates normal play
- 10/10 in 60:00 (0) **loses** to 9/10 in 1:00 (8520) — the owner's exact scenario
- The crossover is ~4 minutes, well outside typical play

`CORRECT_POINTS` and `POINTS_PER_SECOND` are exported constants — retuning the
accuracy/speed balance is a two-number change. **If you change them, change the SQL
generated column too** (item 1). Keeping those two in step is the main maintenance
hazard introduced by this design.

---

## 4. TODO — IN ORDER

### 1. Make the score formula live (do this first; everything else is cosmetic)
New migration `supabase/migrations/20260728120000_score.sql`:
- Add generated stored column to `attempts`:
  `score int generated always as (greatest(0, correct_count * 1000 - round(elapsed_ms / 1000.0 * 8)::int)) stored`
- Index `(game_id, score desc, elapsed_ms asc)`
- `create or replace` **both** `leaderboard_page()` and `attempt_rank()` in
  `20260701000000_init.sql` to order by `score desc, elapsed_ms asc` instead of
  `correct_count desc, elapsed_ms asc`
- Apply it, then confirm the ladder with a hand-built pair of attempts

### 2. Rewrite the ranking tests to the new rule
In `tests/scoring.test.ts` / `tests/gameplay.test.ts`, replace the
"10/10 always wins" assertions with:
- 10/10 @ 2:00 ranks above 9/10 @ 1:00
- 10/10 @ 60:00 ranks **below** 9/10 @ 1:00
- `perkulScore()` never returns negative
- TS `compareRanked()` and the SQL ordering agree on the same fixture set
Then `npm test` must pass.

### 3. Renumber games to #210–#229
`BRAND.firstGameNumber = 210` exists but nothing consumes it yet.
- Wire it into `src/content/index.ts` (game number = index + `firstGameNumber`)
- One-shot SQL for already-seeded rows: `update games set game_number = game_number + 209;`
  (safe — 1–20 → 210–229, no unique collision)
- Check `padGameNumber()` still renders sensibly at 3 digits

### 4. Game-like visual pass
The owner's words: *"looks NYT-esque, simple and fast — just make it more game-like,
not like reading a newspaper."* Keep it fast and typographic; **do not** introduce
gradients, glassmorphism, rounded-card spam, or an animation library (spec §52 still
holds). Tokens already exist in `globals.css`: `--panel`, `--panel-soft`, `--accent`
(gold), `--hit`, `--miss`.
Suggested: dark panel behind the active game, bolder/animated score reveal, stronger
word-button press states, gold for live timer + score.

### 5. Gameplay screen prompt
Add a persistent **"Choose the fake word"** heading above the five options in
`src/components/GameClient.tsx` so the task is never ambiguous mid-round.

### 6. Results screen fixes (`src/components/ResultsView.tsx`)
- Label the grade explicitly: **"Grade B"**, not a bare `B`
- **Delete** the `<span className="standing__note">Not real players</span>` line
- Replace the "Copy result" button with a **Share result** menu: native
  `navigator.share` where available, plus X, Facebook, email (`mailto:`), and copy.
  Reuse `buildShareText()` from `src/lib/share.ts` — it is already spoiler-free and
  must stay that way (spec §94)

### 7. Replay for fun
Do **not** lock players out after completing. Add "Play again (just for fun)" on the
results screen. The `practice_replay` feature flag and unranked-attempt path already
exist in `src/lib/attempts.ts` — enable the flag and wire the button. Show a clear
persistent banner during a replay: not ranked, no leaderboard, no streak.

### 8. Remaining copy fixes
- `src/app/page.tsx`: delete "— not when the page loads" from the clock sentence
- Confirm `BRAND.rule` ("Most right, fastest, wins.") and `BRAND.cadence`
  ("One new quiz per day. Updated at 12:00 AM ET.") are both rendered on the homepage
- Sweep "invented one" → "fake word" in `how-to-play/page.tsx` and `layout.tsx`
  metadata (content-file rationales may keep the word "invented" — that's editorial prose)

### 9. Ship
`npm run typecheck && npm test` → commit → push. Vercel auto-deploys from `main`.

---

## 5. GOTCHAS THAT WILL BITE YOU

- **Never** send answer data to the browser pre-completion: no `is_real`, no fake
  word, no definitions, no decoy identity. Gameplay routes use the service-role
  client server-side; RLS denies these tables to anon/authenticated. `scripts/smoke.ts`
  asserts this — keep it passing.
- **Context budget:** `globals.css`, `GameClient.tsx`, `ResultsView.tsx` and the four
  content files are large. `replace_in_file` echoes the **whole file** back. Prefer
  narrow `search_files` regexes over full reads, and batch edits. This is what ended
  the previous session early.
- **Dates:** every "today" decision goes through `America/New_York` via
  `src/lib/time.ts`. Never hardcode UTC-5. No cron exists or is needed — the daily
  game resolves from the current NY calendar date per request.
- **Do not** dynamically generate puzzle content at runtime with an LLM (spec §81).
  AI is an editorial tool only; games are pre-authored, validated, reviewed, published.
- **Terminal output capture on this machine is flaky.** Redirect to a temp file and
  read it back rather than trusting inline stdout. Log filenames matching `git*.txt`
  are git-ignored.

---

## 6. OWNER ACTION ITEMS (not code)

- [ ] **Rotate the Supabase service-role key** — it was pasted into a chat. Supabase →
      Settings → API → rotate, then update Vercel env vars and `.env.local`.
- [ ] Confirm `perkul.com` domain + Supabase redirect URLs per `DEPLOY.md`
- [ ] Vercel Hobby tier is free but non-commercial; Pro is required if Perkul ever
      monetizes
