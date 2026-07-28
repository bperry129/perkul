import 'server-only';
import { serviceClient } from './supabase/admin';
import { flagEnabled } from './flags';
import { perkulScore } from './scoring';
import type { LeaderboardRow } from './types';

export type LeaderboardPage = {
  rows: LeaderboardRow[];
  total: number;
  page: number;
  pageSize: number;
  you: LeaderboardRow | null;
  neighbours: LeaderboardRow[];
  includesSimulated: boolean;
};

// Shape returned by the leaderboard_page RPC
type RpcRow = {
  attempt_id: string;
  rank: number;
  display_name: string | null;
  correct_count: number;
  elapsed_ms: number;
  score: number | null;
  is_registered: boolean;
  is_simulated: boolean;
};

function mapRpcRow(row: RpcRow): LeaderboardRow {
  const correctCount = Number(row.correct_count ?? 0);
  const elapsedMs = Number(row.elapsed_ms ?? 0);
  return {
    rank: Number(row.rank),
    attemptId: row.attempt_id,
    displayName: row.display_name ?? 'Guest',
    correctCount,
    elapsedMs,
    score: row.score != null ? Number(row.score) : perkulScore(correctCount, elapsedMs),
    isRegistered: Boolean(row.is_registered),
    isSimulated: Boolean(row.is_simulated),
  };
}

/**
 * Leaderboard page.
 *
 * - **Rows** come from the `leaderboard_page` RPC which handles the
 *   COALESCE of display_name_override / profiles.display_name / 'Guest'
 *   server-side (the column isn't accessible via the REST API directly).
 * - **Total** and **rank** come from direct table queries so pagination
 *   works reliably with simulated data at any offset.
 */
export async function getLeaderboardPage(options: {
  gameId: string;
  page?: number;
  pageSize?: number;
  myAttemptId?: string | null;
}): Promise<LeaderboardPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const includeSimulated = await flagEnabled('simulated_data');
  const db = serviceClient();

  // ------------------------------------------------------------------ total
  // Direct count so pagination maths are consistent with what rows we fetch.
  let countQ = db
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', options.gameId)
    .eq('is_ranked', true)
    .eq('completion_status', 'completed')
    .eq('integrity_status', 'valid');
  if (!includeSimulated) countQ = countQ.eq('is_simulated', false);
  const { count: rawCount } = await countQ;
  const total = Number(rawCount ?? 0);

  // ------------------------------------------------------------------- rows
  // Use the RPC which computes display_name server-side.
  const { data: pageData } = await db.rpc('leaderboard_page', {
    p_game_id: options.gameId,
    p_limit: pageSize,
    p_offset: offset,
    p_include_simulated: includeSimulated,
  });

  const rows: LeaderboardRow[] = ((pageData ?? []) as RpcRow[]).map(mapRpcRow);

  // --------------------------------------------------------- find "you"
  let you: LeaderboardRow | null = null;
  let neighbours: LeaderboardRow[] = [];

  if (options.myAttemptId) {
    const inPage = rows.find((r) => r.attemptId === options.myAttemptId);
    if (inPage) {
      you = { ...inPage, isYou: true };
      rows[rows.indexOf(inPage)] = you;
    } else {
      // User not visible on this page: compute exact rank from a direct count
      // query and load the 3 surrounding rows via the RPC.
      const { data: myData } = await db
        .from('attempts')
        .select('id, correct_count, elapsed_ms, score')
        .eq('id', options.myAttemptId)
        .maybeSingle();

      if (myData) {
        const d = myData as Record<string, unknown>;
        const myScore =
          d.score != null
            ? Number(d.score)
            : perkulScore(Number(d.correct_count ?? 0), Number(d.elapsed_ms ?? 0));
        const myElapsed = Number(d.elapsed_ms ?? 0);

        let betterQ = db
          .from('attempts')
          .select('id', { count: 'exact', head: true })
          .eq('game_id', options.gameId)
          .eq('is_ranked', true)
          .eq('completion_status', 'completed')
          .eq('integrity_status', 'valid');
        if (!includeSimulated) betterQ = betterQ.eq('is_simulated', false);
        const { count: betterCount } = await betterQ.or(
          `score.gt.${myScore},and(score.eq.${myScore},elapsed_ms.lt.${myElapsed})`,
        );
        const myRank = Number(betterCount ?? 0) + 1;

        // Load the 3 rows bracketing the user via the RPC (so names show).
        const nearOffset = Math.max(0, myRank - 2);
        const { data: nearData } = await db.rpc('leaderboard_page', {
          p_game_id: options.gameId,
          p_limit: 3,
          p_offset: nearOffset,
          p_include_simulated: includeSimulated,
        });

        neighbours = ((nearData ?? []) as RpcRow[]).map((row, i) => {
          const mapped = mapRpcRow({ ...row, rank: nearOffset + i + 1 });
          if (row.attempt_id === options.myAttemptId) {
            you = { ...mapped, isYou: true };
            return you;
          }
          return mapped;
        });
      }
    }
  }

  return { rows, total, page, pageSize, you, neighbours, includesSimulated: includeSimulated };
}

export type DailyStats = {
  completions: number;
  avgCorrect: number | null;
  medianElapsedMs: number | null;
  perfectGames: number;
  registered: number;
  anonymous: number;
};

export async function getDailyStats(
  gameId: string,
  includeSimulated?: boolean,
): Promise<DailyStats> {
  const include = includeSimulated ?? (await flagEnabled('simulated_data'));
  const { data } = await serviceClient().rpc('daily_stats', {
    p_game_id: gameId,
    p_include_simulated: include,
  });
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return {
    completions: Number(row?.completions ?? 0),
    avgCorrect: row?.avg_correct != null ? Number(row.avg_correct) : null,
    medianElapsedMs: row?.median_elapsed_ms != null ? Number(row.median_elapsed_ms) : null,
    perfectGames: Number(row?.perfect_games ?? 0),
    registered: Number(row?.registered ?? 0),
    anonymous: Number(row?.anonymous ?? 0),
  };
}
