/**
 * Pure ranking, streak and integrity logic. No I/O, no Supabase — this file is
 * the game's rulebook and is covered directly by the test suite.
 *
 * THE fundamental rule: accuracy first, speed second. A 10/10 always beats a
 * 9/10 no matter the clock.
 */
import { addDays } from './time';

export type RankableAttempt = {
  correctCount: number;
  elapsedMs: number;
  /** tie-break of last resort: whoever finished first */
  completedAt?: string | number | null;
};

export function compareRanked(a: RankableAttempt, b: RankableAttempt): number {
  if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
  if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
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
