/**
 * Press Your Luck — pure game math, deliberately free of `server-only` or any
 * DB import so it can run identically in the client (for instant feedback on
 * every press), the server (to validate a submitted score is plausible), and
 * `tests/press-your-luck.test.ts`. One rule, one place, same shape as
 * `src/lib/scoring.ts` for the daily game.
 *
 * THE RULE: score starts at 0. Every successful press adds 1. The chance the
 * *next* press busts the run equals the current score, in whole percent —
 * one percentage point per point of score — capped at MAX_BUST_CHANCE so it
 * is never a certainty, however long a run goes on.
 */

/** The bust chance never reaches 100% — there's always a way to survive. */
export const MAX_BUST_CHANCE = 85;

/** Chance (0..MAX_BUST_CHANCE), as a whole percent, that the NEXT press busts
 * the run, given the number of presses already banked in this run. */
export function bustChanceForScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(MAX_BUST_CHANCE, Math.floor(score));
}

/**
 * P(a run reaches at least this score), assuming the player always presses
 * and never banks early — the product of every survival step from 0 up to
 * score-1. Pure math: reaching score 0 is a certainty (1), and each step
 * multiplies by (1 - bustChanceForScore(k) / 100).
 */
export function probabilityOfReaching(score: number): number {
  if (score <= 0) return 1;
  let p = 1;
  for (let k = 0; k < score; k += 1) {
    p *= 1 - bustChanceForScore(k) / 100;
  }
  return p;
}

/**
 * Expected run length (in presses banked before a bust) if the player always
 * presses and never banks. E[X] = sum_{k>=1} P(X >= k); the sum converges
 * quickly because every step past the 85% cap only adds 15% survival odds.
 */
export function expectedScore(maxIterations = 500): number {
  let total = 0;
  for (let k = 1; k <= maxIterations; k += 1) {
    const p = probabilityOfReaching(k);
    total += p;
    if (p < 1e-9) break;
  }
  return total;
}

export type OddsRow = {
  score: number;
  /** Bust chance (%) on the press that would take you past this score. */
  bustChance: number;
  /** Chance (%) that an unbanked run ever reaches this score at all. */
  reachChancePercent: number;
};

/** A fixed table for the "odds" section of the instructions — deterministic
 * and cheap, so it never needs a database round trip. */
export function oddsTable(
  scores: number[] = [5, 10, 15, 20, 25, 30, 40, 50, 60, 85],
): OddsRow[] {
  return scores.map((score) => ({
    score,
    bustChance: bustChanceForScore(score),
    reachChancePercent: Math.round(probabilityOfReaching(score) * 100 * 100) / 100,
  }));
}

/** A generous, deterministic sanity ceiling for a submitted score — not a
 * real anti-cheat system for a for-fun arcade minigame, just a guard against
 * a hand-typed request. At the 85% cap, reaching this is already the kind of
 * outcome that happens to roughly 1 run in several hundred billion. */
export const MAX_PLAUSIBLE_SCORE = 500;
