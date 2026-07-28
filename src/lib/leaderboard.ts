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

/** Columns to select from attempts — NO embedded join so the row shape is reliable */
const ATTEMPT_SELECT = 'id, correct_count, elapsed_ms, score, is_simulated, display_name_override, user_id';

type AttemptPageRow = {
  id: string;
  correct_count: number | null;
  elapsed_ms: number | null;
  score: number | null;
  is_simulated: boolean;
  display_name_override: string | null;
  user_id: string | null;
};

type ProfileRecord = { user_id: string; display_name: string | null; is_registered: boolean };

/** Batch-fetch display names by user_id so we avoid embedded-join issues */
async function fetchProfiles(userIds: string[]): Promise<Map<string, ProfileRecord>> {
  if (!userIds.length) return new Map();
  const { data } = await serviceClient()
    .from('profiles')
    .select('user_id, display_name, is_registered')
    .in('user_id', userIds);
  const out = new Map<string, ProfileRecord>();
  for (const row of (data ?? []) as ProfileRecord[]) out.set(row.user_id, row);
  return out;
}

function mapAttempt(
  row: AttemptPageRow,
  rank: number,
  profiles: Map<string, ProfileRecord>,
): LeaderboardRow {
  const correctCount = Number(row.correct_count ?? 0);
  const elapsedMs = Number(row.elapsed_ms ?? 0);
  const profile = row.user_id ? profiles.get(row.user_id) : null;
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

  const rawRows = (pageData ?? []) as unknown as AttemptPageRow[];
  const pageUserIds = rawRows.map((r) => r.user_id).filter(Boolean) as string[];
  const profiles = await fetchProfiles(pageUserIds);

  const rows: LeaderboardRow[] = rawRows.map((row, i) =>
    mapAttempt(row, offset + i + 1, profiles),
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
        .select(ATTEMPT_SELECT)
        .eq('id', options.myAttemptId)
        .maybeSingle();

      if (myData) {
        const myRow = myData as unknown as AttemptPageRow;
        const myScore =
          myRow.score != null
            ? Number(myRow.score)
            : perkulScore(Number(myRow.correct_count ?? 0), Number(myRow.elapsed_ms ?? 0));
        const myElapsed = Number(myRow.elapsed_ms ?? 0);

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

        const nearRaws = (nearData ?? []) as unknown as AttemptPageRow[];
        const nearUserIds = nearRaws.map((r) => r.user_id).filter(Boolean) as string[];
        const nearProfiles = await fetchProfiles(nearUserIds);

        neighbours = nearRaws.map((row, i) => {
          const mapped = mapAttempt(row, nearOffset + i + 1, nearProfiles);
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
