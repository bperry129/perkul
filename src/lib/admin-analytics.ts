import 'server-only';
import { serviceClient } from './supabase/admin';
import { flagEnabled } from './flags';
import { nyDateString, addDays } from './time';

/** Numbers an operator actually needs to run the game day to day. */
export type DashboardSummary = {
  today: string;
  todayGame: { id: string; gameNumber: number; status: string } | null;
  tomorrowGame: { id: string; gameNumber: number; status: string } | null;
  publishedFuture: number;
  runwayDays: number;
  lastScheduledDate: string | null;
  startsToday: number;
  completionsToday: number;
  completionRate: number | null;
  avgCorrect: number | null;
  medianElapsedMs: number | null;
  registeredPlayers: number;
  anonymousPlayersToday: number;
  simulatedAttempts: number;
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const db = serviceClient();
  const today = nyDateString();
  const tomorrow = addDays(today, 1);
  const includeSimulated = await flagEnabled('simulated_data');

  const { data: games } = await db
    .from('games')
    .select('id, game_number, status, active_date')
    .in('active_date', [today, tomorrow]);
  const gameRows = (games ?? []) as Array<{
    id: string;
    game_number: number;
    status: string;
    active_date: string;
  }>;
  const todayGame = gameRows.find((g) => g.active_date === today) ?? null;
  const tomorrowGame = gameRows.find((g) => g.active_date === tomorrow) ?? null;

  const { data: published } = await db
    .from('games')
    .select('active_date')
    .eq('status', 'published')
    .gte('active_date', today)
    .order('active_date', { ascending: false });
  const futureDates = ((published ?? []) as Array<{ active_date: string }>).map((r) => r.active_date);

  type DailyStatsRow = {
    completions: number;
    avg_correct: number | null;
    median_elapsed_ms: number | null;
    registered: number;
    anonymous: number;
  };

  let stats: DailyStatsRow | null = null;

  if (todayGame) {
    const { data } = await db.rpc('daily_stats', {
      p_game_id: todayGame.id,
      p_include_simulated: includeSimulated,
    });
    stats = ((Array.isArray(data) ? data[0] : data) ?? null) as DailyStatsRow | null;
  }

  const startsQuery = todayGame
    ? await db
        .from('attempts')
        .select('id', { count: 'exact', head: true })
        .eq('game_id', todayGame.id)
        .eq('is_simulated', false)
    : { count: 0 };

  const { count: registeredPlayers } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  const { count: simulatedAttempts } = await db
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('is_simulated', true);

  const starts = startsQuery.count ?? 0;
  const completions = Number(stats?.completions ?? 0);

  return {
    today,
    todayGame: todayGame
      ? { id: todayGame.id, gameNumber: todayGame.game_number, status: todayGame.status }
      : null,
    tomorrowGame: tomorrowGame
      ? { id: tomorrowGame.id, gameNumber: tomorrowGame.game_number, status: tomorrowGame.status }
      : null,
    publishedFuture: futureDates.length,
    runwayDays: futureDates.length,
    lastScheduledDate: futureDates[0] ?? null,
    startsToday: starts,
    completionsToday: completions,
    completionRate: starts > 0 ? (completions / starts) * 100 : null,
    avgCorrect: stats?.avg_correct != null ? Number(stats.avg_correct) : null,
    medianElapsedMs: stats?.median_elapsed_ms != null ? Number(stats.median_elapsed_ms) : null,
    registeredPlayers: registeredPlayers ?? 0,
    anonymousPlayersToday: Number(stats?.anonymous ?? 0),
    simulatedAttempts: simulatedAttempts ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Round-level analytics                                                       */
/* -------------------------------------------------------------------------- */

export type RoundAnalyticsRow = {
  gameNumber: number;
  activeDate: string;
  roundPosition: number;
  fakeWord: string;
  decoyWord: string | null;
  correctPercent: number;
  decoyPercent: number | null;
  sampleSize: number;
  medianResponseMs: number | null;
  flag: 'suspiciously_low' | 'suspiciously_high' | null;
};

export async function getRoundAnalytics(limitGames = 8): Promise<RoundAnalyticsRow[]> {
  const db = serviceClient();
  const includeSimulated = await flagEnabled('simulated_data');
  const today = nyDateString();

  const { data: games } = await db
    .from('games')
    .select('id, game_number, active_date')
    .lte('active_date', today)
    .eq('status', 'published')
    .order('active_date', { ascending: false })
    .limit(limitGames);

  const rows: RoundAnalyticsRow[] = [];

  for (const game of (games ?? []) as Array<{
    id: string;
    game_number: number;
    active_date: string;
  }>) {
    const { data: stats } = await db.rpc('round_selection_stats', {
      p_game_id: game.id,
      p_include_simulated: includeSimulated,
    });

    const byRound = new Map<
      string,
      {
        position: number;
        total: number;
        fakeWord: string;
        fakeSelections: number;
        others: Array<{ word: string; selections: number }>;
      }
    >();

    for (const row of (stats ?? []) as Array<{
      round_id: string;
      round_position: number;
      display_word: string;
      is_fake: boolean;
      selections: number;
      round_total: number;
    }>) {
      const entry =
        byRound.get(row.round_id) ??
        {
          position: row.round_position,
          total: Number(row.round_total),
          fakeWord: '',
          fakeSelections: 0,
          others: [],
        };
      if (row.is_fake) {
        entry.fakeWord = row.display_word;
        entry.fakeSelections = Number(row.selections);
      } else {
        entry.others.push({ word: row.display_word, selections: Number(row.selections) });
      }
      byRound.set(row.round_id, entry);
    }

    for (const entry of byRound.values()) {
      if (entry.total === 0) continue;
      const correctPercent = (entry.fakeSelections / entry.total) * 100;
      const topWrong = entry.others.sort((a, b) => b.selections - a.selections)[0] ?? null;
      rows.push({
        gameNumber: game.game_number,
        activeDate: game.active_date,
        roundPosition: entry.position,
        fakeWord: entry.fakeWord,
        decoyWord: topWrong?.word ?? null,
        correctPercent: Math.round(correctPercent * 10) / 10,
        decoyPercent: topWrong ? Math.round((topWrong.selections / entry.total) * 1000) / 10 : null,
        sampleSize: entry.total,
        medianResponseMs: null,
        flag:
          correctPercent < 25 ? 'suspiciously_low' : correctPercent > 95 ? 'suspiciously_high' : null,
      });
    }
  }

  return rows.sort((a, b) => a.correctPercent - b.correctPercent);
}

export type AccuracyHistogram = { correct: number; count: number }[];

export async function getAccuracyHistogram(gameId: string): Promise<AccuracyHistogram> {
  const includeSimulated = await flagEnabled('simulated_data');
  let query = serviceClient()
    .from('attempts')
    .select('correct_count')
    .eq('game_id', gameId)
    .eq('is_ranked', true)
    .not('completed_at', 'is', null)
    .eq('integrity_status', 'valid');
  if (!includeSimulated) query = query.eq('is_simulated', false);

  const { data } = await query;
  const buckets = new Map<number, number>();
  for (let i = 0; i <= 10; i += 1) buckets.set(i, 0);
  for (const row of (data ?? []) as Array<{ correct_count: number | null }>) {
    const value = Number(row.correct_count ?? 0);
    buckets.set(value, (buckets.get(value) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([correct, count]) => ({ correct, count }));
}

export type EventCount = { name: string; count: number };

export async function getEventCounts(days = 7): Promise<EventCount[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await serviceClient()
    .from('analytics_events')
    .select('name')
    .gte('created_at', since)
    .limit(50000);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ name: string }>) {
    counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export type PlayerRow = {
  userId: string;
  displayName: string | null;
  isAdmin: boolean;
  leaderboardOptIn: boolean;
  isBannedName: boolean;
  createdAt: string;
  attempts: number;
};

export async function searchPlayers(query?: string, limit = 50): Promise<PlayerRow[]> {
  let request = serviceClient()
    .from('profiles')
    .select('user_id, display_name, is_admin, leaderboard_opt_in, is_banned_name, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (query?.trim()) request = request.ilike('display_name', `%${query.trim()}%`);

  const { data } = await request;
  const rows = (data ?? []) as Array<{
    user_id: string;
    display_name: string | null;
    is_admin: boolean;
    leaderboard_opt_in: boolean;
    is_banned_name: boolean;
    created_at: string;
  }>;

  const out: PlayerRow[] = [];
  for (const row of rows) {
    const { count } = await serviceClient()
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', row.user_id);
    out.push({
      userId: row.user_id,
      displayName: row.display_name,
      isAdmin: row.is_admin,
      leaderboardOptIn: row.leaderboard_opt_in,
      isBannedName: row.is_banned_name,
      createdAt: row.created_at,
      attempts: count ?? 0,
    });
  }
  return out;
}

export type AttemptAdminRow = {
  id: string;
  gameNumber: number | null;
  activeDate: string | null;
  displayName: string | null;
  correctCount: number | null;
  elapsedMs: number | null;
  isRanked: boolean;
  integrityStatus: string;
  isSimulated: boolean;
  completedAt: string | null;
  notes: string | null;
};

export async function listAttempts(options: {
  integrity?: string | null;
  includeSimulated?: boolean;
  limit?: number;
} = {}): Promise<AttemptAdminRow[]> {
  let query = serviceClient()
    .from('attempts')
    .select(
      'id, correct_count, elapsed_ms, is_ranked, integrity_status, is_simulated, completed_at, integrity_notes, display_name_override, user_id, games (game_number, active_date)',
    )
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 100);

  if (options.integrity) query = query.eq('integrity_status', options.integrity);
  if (!options.includeSimulated) query = query.eq('is_simulated', false);

  const { data } = await query;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const game = (Array.isArray(row.games) ? row.games[0] : row.games) as
      | { game_number: number; active_date: string }
      | undefined;
    return {
      id: row.id as string,
      gameNumber: game?.game_number ?? null,
      activeDate: game?.active_date ?? null,
      displayName: (row.display_name_override as string | null) ?? (row.user_id ? 'Registered' : 'Guest'),
      correctCount: row.correct_count as number | null,
      elapsedMs: row.elapsed_ms as number | null,
      isRanked: Boolean(row.is_ranked),
      integrityStatus: row.integrity_status as string,
      isSimulated: Boolean(row.is_simulated),
      completedAt: row.completed_at as string | null,
      notes: row.integrity_notes as string | null,
    };
  });
}
