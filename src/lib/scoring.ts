/**
 * Pure ranking, streak and integrity logic. No I/O, no Supabase — this file is
 * the game's rulebook and is covered directly by the test suite.
 *
 * THE RULE: most right in the least time wins.
 *
 * Ranking is by Perkul Score, not by accuracy alone. Each correct answer is
 * worth CORRECT_POINTS, and every second on the clock costs POINTS_PER_SECOND.
 * The two constants are chosen so that:
 *
 *   - Within normal play, accuracy still dominates. A 10/10 in 2:00 beats a
 *     9/10 in 1:00, because one correct answer is worth ~125 seconds.
 *   - A pathologically slow perfect game loses. A 10/10 that took an hour
 *     ranks below a 9/10 that took a minute, which is the intended behaviour.
 *
 * Raising POINTS_PER_SECOND makes the game more of a race; lowering it moves
 * back toward pure accuracy. Change these two numbers and the whole ladder
 * retunes — but note the DB has a generated column using the same maths, so
 * migrations/20260728120000_score.sql must be kept in step.
 */
import { addDays } from './time';

/** Points earned per correct answer. */
export const CORRECT_POINTS = 1000;
/** Points surrendered per second elapsed. 1000/8 => one answer ≈ 125 seconds. */
export const POINTS_PER_SECOND = 8;

/**
 * The single number the leaderboard sorts on. Floored at zero so a very slow
 * game reads as 0 rather than a confusing negative.
 */
export function perkulScore(correctCount: number, elapsedMs: number): number {
  const gross = correctCount * CORRECT_POINTS;
  const penalty = Math.round((Math.max(0, elapsedMs) / 1000) * POINTS_PER_SECOND);
  return Math.max(0, gross - penalty);
}

/**
 * The ceiling for a game: every round correct with the clock at zero. Ten
 * rounds => 10,000, which is the "out of" number shown on the results page.
 */
export function maxPerkulScore(roundsTotal = 10): number {
  return Math.max(0, roundsTotal) * CORRECT_POINTS;
}

/**
 * The same number as `perkulScore()`, itemised for display. `penalty` is capped
 * at `gross` so the shown arithmetic always adds up to the floored score, while
 * `penaltyUncapped` keeps the raw time cost for anyone who wants it.
 */
export function scoreBreakdown(
  correctCount: number,
  elapsedMs: number,
  roundsTotal = 10,
): {
  score: number;
  maxScore: number;
  gross: number;
  penalty: number;
  penaltyUncapped: number;
} {
  const gross = correctCount * CORRECT_POINTS;
  const penaltyUncapped = Math.round((Math.max(0, elapsedMs) / 1000) * POINTS_PER_SECOND);
  return {
    score: perkulScore(correctCount, elapsedMs),
    maxScore: maxPerkulScore(roundsTotal),
    gross,
    penalty: Math.min(gross, penaltyUncapped),
    penaltyUncapped,
  };
}

/** 8,520 — grouped thousands, stable across locales. */
export function formatPoints(points: number): string {
  return Math.round(points).toLocaleString('en-US');
}


export type RankableAttempt = {
  correctCount: number;
  elapsedMs: number;
  /** tie-break of last resort: whoever finished first */
  completedAt?: string | number | null;
};

/** Higher score first; then the faster clock; then whoever finished first. */
export function compareRanked(a: RankableAttempt, b: RankableAttempt): number {
  const as = perkulScore(a.correctCount, a.elapsedMs);
  const bs = perkulScore(b.correctCount, b.elapsedMs);
  if (as !== bs) return bs - as;
  if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
  if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
  const at = a.completedAt ? new Date(a.completedAt).getTime() : 0;
  const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0;
  return at - bt;
}

export function sortLeaderboard<T extends RankableAttempt>(rows: readonly T[]): T[] {
  return [...rows].sort(compareRanked);
}

/** 1-based rank of `me` within `pool` (pool may or may not contain me). */
export function rankWithin(me: RankableAttempt, pool: readonly RankableAttempt[]): number {
  let ahead = 0;
  for (const other of pool) {
    if (compareRanked(other, me) < 0) ahead += 1;
  }
  return ahead + 1;
}

/* -------------------------------------------------------------------------- */
/* Streaks                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A streak is a ranked completion on consecutive New York calendar dates.
 * Practice replays never count. `dates` are YYYY-MM-DD strings (NY dates) of
 * ranked completions; duplicates are tolerated.
 */
export function computeStreaks(
  dates: readonly string[],
  today: string,
): { current: number; longest: number } {
  const unique = Array.from(new Set(dates)).sort();
  if (unique.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i += 1) {
    if (addDays(unique[i - 1], 1) === unique[i]) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
  }

  // Current streak: must include today or yesterday, walking backwards.
  const yesterday = addDays(today, -1);
  const set = new Set(unique);
  let cursor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  let current = 0;
  while (cursor && set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  return { current, longest };
}

/* -------------------------------------------------------------------------- */
/* Integrity                                                                   */
/* -------------------------------------------------------------------------- */

/** Ten deliberate reads and clicks cannot plausibly happen faster than this. */
export const MIN_PLAUSIBLE_TOTAL_MS = 5_000;
/** Beyond this we stop trusting the session as a competitive result. */
export const MAX_PLAUSIBLE_TOTAL_MS = 6 * 60 * 60 * 1000;

export type IntegrityInput = {
  elapsedMs: number;
  roundsTotal: number;
  answeredRounds: number;
  distinctRounds: number;
  optionsValid: boolean;
  gameIsLive: boolean;
  duplicateCompletion: boolean;
};

export type IntegrityVerdict = {
  status: 'valid' | 'suspicious' | 'unranked' | 'admin_review';
  notes: string[];
};

export function evaluateIntegrity(input: IntegrityInput): IntegrityVerdict {
  const notes: string[] = [];
  let status: IntegrityVerdict['status'] = 'valid';

  const escalate = (next: IntegrityVerdict['status']) => {
    const order = { valid: 0, suspicious: 1, admin_review: 2, unranked: 3 } as const;
    if (order[next] > order[status]) status = next;
  };

  if (!input.optionsValid) {
    notes.push('Submitted an option that does not belong to this round.');
    escalate('admin_review');
  }
  if (input.answeredRounds !== input.roundsTotal || input.distinctRounds !== input.roundsTotal) {
    notes.push('Incomplete or duplicated round submission.');
    escalate('admin_review');
  }
  if (input.duplicateCompletion) {
    notes.push('Duplicate completion for an attempt that was already finished.');
    escalate('suspicious');
  }
  if (input.elapsedMs < MIN_PLAUSIBLE_TOTAL_MS) {
    notes.push(`Impossibly fast completion (${input.elapsedMs}ms).`);
    escalate('suspicious');
  }
  if (input.elapsedMs > MAX_PLAUSIBLE_TOTAL_MS) {
    notes.push('Session left open far beyond a plausible playing session.');
    escalate('suspicious');
  }
  if (!input.gameIsLive) {
    notes.push('Submitted against a game that is no longer live.');
    escalate('unranked');
  }

  return { status, notes };
}

/* -------------------------------------------------------------------------- */
/* Percentiles from real data                                                  */
/* -------------------------------------------------------------------------- */

export function percentileFromRank(rank: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, ((total - rank) / total) * 100));
}
