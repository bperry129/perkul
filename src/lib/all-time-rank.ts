/**
 * Pure all-time ranking rules. No I/O, so the test suite can assert them
 * directly (see tests/all-time.test.ts). The database reads live in
 * `src/lib/all-time.ts`.
 *
 * Two ladders, deliberately:
 *
 *   average — score per game. Recognises a player who is very good on the days
 *             they show up, instead of ranking pure attendance. Needs a floor
 *             to mean anything, hence MIN_GAMES_FOR_AVERAGE.
 *   total   — every point ever earned, added up. Volume counts here.
 */

/** A player must have completed this many games to appear on the average board. */
export const MIN_GAMES_FOR_AVERAGE = 5;

export type AllTimeMetric = 'average' | 'total';

export type AllTimeStanding = {
  displayName: string;
  gamesPlayed: number;
  totalScore: number;
  /** totalScore / gamesPlayed. The Smartest Players number. */
  averageScore: number;
};

/** Minimum games required to appear on a given board. */
export function minGamesFor(metric: AllTimeMetric): number {
  return metric === 'average' ? MIN_GAMES_FOR_AVERAGE : 1;
}

/** Sort comparator: best first. */
export function compareAllTime<T extends AllTimeStanding>(
  metric: AllTimeMetric,
  a: T,
  b: T,
): number {
  if (metric === 'average') {
    if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
    // The same average over more games is the more convincing record.
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
  } else {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    // The same total from fewer games is the stronger performance.
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
    if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
  }
  return a.displayName.localeCompare(b.displayName);
}

/**
 * Apply the games-played floor, sort, and stamp 1-based ranks. Players below
 * the floor are removed rather than shown unranked: the board is a claim about
 * who is good, and one lucky game is not evidence.
 */
export function rankAllTime<T extends AllTimeStanding & { rank: number }>(
  rows: readonly T[],
  metric: AllTimeMetric,
  minGames: number = minGamesFor(metric),
): T[] {
  return rows
    .filter((row) => row.gamesPlayed >= minGames)
    .slice()
    .sort((a, b) => compareAllTime(metric, a, b))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}
