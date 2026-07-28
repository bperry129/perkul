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
  /** rows surrounding the player when they are outside the visible page */
  neighbours: LeaderboardRow[];
  includesSimulated: boolean;
};

type ProfileRow = { display_name: string | null; is_registered: boolean };

type AttemptRowRaw = {
  id: string;
  correct_count: number | null;
  elapsed_ms: number | null;
  score: number | null;
  is_simulated: boolean;
  display_name_override: string | null;
  user_id: string | null;
  profiles: ProfileRow | ProfileRow[] | null;
};

function mapRaw(row: AttemptRowRaw, rank: number): LeaderboardRow {
  const correctCount = Number(row.correct_count ?? 0);
  const elapsedMs = Number(row.elapsed_ms ?? 0);
  const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as ProfileRow | null;
  return {
    rank,
    attemptId: row.id,
    displayName: row.display_name_override ?? profile?.display_name ?? 'Guest',
    correctCount,
    elapsedMs,
    score: row.score != null ? Number(row.score) : perkulScore(correctCount, elapsedMs),
    isRegistered: Boolean(profile?.is_registered),
    isSimulated: Boolean(row.is_simulated),
  };
}

const ATTEMPT_SELECT =
  'id, correct_count, elapsed_ms, score, is_simulated, display_name_override, user_id, ' +
  'profiles!user_id(display_name, is_registered)';

/**
 * Ranking is computed via direct table queries (not an RPC) so that pagination
 * works reliably across both real and simulated entries. The ordering matches
 * compareRanked() in ./scoring: score DESC, elapsed_ms ASC.
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
  let rowsQ = db
    .from('attempts')
    .select(ATTEMPT_SELECT)
    .eq('game_id', options.gameId)
    .eq('is_ranked', true)
    .eq('completion_status', 'completed')
    .eq('integrity_status', 'valid');
  if (!includeSimulated) rowsQ = rowsQ.eq('is_simulated', false);
  const { data: pageData } = await rowsQ
    .order('score', { ascending: false, nullsFirst: false })
    .order('elapsed_ms', { ascending: true })
    .range(offset, offset + pageSize - 1);

  const rows: LeaderboardRow[] = ((pageData ?? []) as unknown as AttemptRowRaw[]).map((row, i) =>
    mapRaw(row, offset + i + 1),
  );

  // --------------------------------------------------------- find "you"
  let you: LeaderboardRow | null = null;
  let neighbours: LeaderboardRow[] = [];

  if (options.myAttemptId) {
    const inPage = rows.find((r) => r.attemptId === options.myAttemptId);
    if (inPage) {
      you = { ...inPage, isYou: true };
      rows[rows.indexOf(inPage)] = you;
    } else {
      // User not in the visible page → compute their rank and load neighbours.
      const { data: myData } = await db
        .from('attempts')
        .select('id, correct_count, elapsed_ms, score')
        .eq('id', options.myAttemptId)
        .maybeSingle();

      if (myData) {
        const myScore =
          (myData as Record<string, unknown>).score != null
            ? Number((myData as Record<string, unknown>).score)
            : perkulScore(
                Number((myData as Record<string, unknown>).correct_count ?? 0),
                Number((myData as Record<string, unknown>).elapsed_ms ?? 0),
              );
        const myElapsed = Number((myData as Record<string, unknown>).elapsed_ms ?? 0);

        // Count how many entries rank strictly above this attempt.
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

        // Load the 3 rows bracketing the user's position.
        const nearOffset = Math.max(0, myRank - 2);
        let nearQ = db
          .from('attempts')
          .select(ATTEMPT_SELECT)
          .eq('game_id', options.gameId)
          .eq('is_ranked', true)
          .eq('completion_status', 'completed')
          .eq('integrity_status', 'valid');
        if (!includeSimulated) nearQ = nearQ.eq('is_simulated', false);
        const { data: nearData } = await nearQ
          .order('score', { ascending: false, nullsFirst: false })
          .order('elapsed_ms', { ascending: true })
          .range(nearOffset, nearOffset + 2);

        neighbours = ((nearData ?? []) as unknown as AttemptRowRaw[]).map((row, i) => {
          const mapped = mapRaw(row, nearOffset + i + 1);
          if (row.id === options.myAttemptId) {
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
