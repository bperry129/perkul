import 'server-only';
import { serviceClient } from './supabase/admin';
import { flagEnabled } from './flags';
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

function mapRow(row: Record<string, unknown>): LeaderboardRow {
  return {
    rank: Number(row.rank),
    attemptId: row.attempt_id as string,
    displayName: (row.display_name as string) ?? 'Guest',
    correctCount: Number(row.correct_count ?? 0),
    elapsedMs: Number(row.elapsed_ms ?? 0),
    isRegistered: Boolean(row.is_registered),
    isSimulated: Boolean(row.is_simulated),
  };
}

/**
 * Ranking is computed in Postgres (accuracy DESC, time ASC) and paginated
 * there too — the browser never receives thousands of rows.
 */
export async function getLeaderboardPage(options: {
  gameId: string;
  page?: number;
  pageSize?: number;
  myAttemptId?: string | null;
}): Promise<LeaderboardPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 25));
  const includeSimulated = await flagEnabled('simulated_data');
  const db = serviceClient();

  const { data } = await db.rpc('leaderboard_page', {
    p_game_id: options.gameId,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
    p_include_simulated: includeSimulated,
  });

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);

  const { data: statsData } = await db.rpc('daily_stats', {
    p_game_id: options.gameId,
    p_include_simulated: includeSimulated,
  });
  const stats = (Array.isArray(statsData) ? statsData[0] : statsData) as
    | { completions: number }
    | undefined;
  const total = Number(stats?.completions ?? rows.length);

  let you: LeaderboardRow | null = null;
  let neighbours: LeaderboardRow[] = [];

  if (options.myAttemptId) {
    const inPage = rows.find((r) => r.attemptId === options.myAttemptId);
    if (inPage) {
      you = { ...inPage, isYou: true };
      rows[rows.indexOf(inPage)] = you;
    } else {
      const { data: rankData } = await db.rpc('attempt_rank', {
        p_attempt_id: options.myAttemptId,
        p_include_simulated: includeSimulated,
      });
      const rankRow = (Array.isArray(rankData) ? rankData[0] : rankData) as
        | { rank: number; total: number }
        | undefined;
      const myRank = Number(rankRow?.rank ?? 0);
      if (myRank > 0) {
        const offset = Math.max(0, myRank - 2);
        const { data: around } = await db.rpc('leaderboard_page', {
          p_game_id: options.gameId,
          p_limit: 3,
          p_offset: offset,
          p_include_simulated: includeSimulated,
        });
        neighbours = ((around ?? []) as Array<Record<string, unknown>>).map((row) => {
          const mapped = mapRow(row);
          if (mapped.attemptId === options.myAttemptId) {
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
