import 'server-only';
import { serviceClient } from './supabase/admin';
import { flagEnabled } from './flags';
import { nyDateString, addDays, diffDays, nyMidnightInstant, formatGameDate, formatGameDateShort } from './time';

/* -------------------------------------------------------------------------- */
/* Date ranges                                                                 */
/* -------------------------------------------------------------------------- */

export type RangePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';

/**
 * An inclusive span of New York calendar dates, plus a label for the page.
 * `days` is the length, which is what the previous comparable period is built
 * from — "past 7 days" is always compared with the 7 days immediately before it.
 */
export type DateRange = {
  preset: RangePreset;
  start: string;
  end: string;
  days: number;
  label: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | undefined | null): string | null {
  if (!value || !DATE_PATTERN.test(value)) return null;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? null : value;
}

function span(start: string, end: string): { start: string; end: string; days: number } {
  // Tolerate a backwards custom range rather than returning nothing.
  const [from, to] = diffDays(start, end) < 0 ? [end, start] : [start, end];
  return { start: from, end: to, days: diffDays(from, to) + 1 };
}

function rangeLabel(start: string, end: string, days: number, today: string): string {
  if (days === 1) return start === today ? 'Today' : formatGameDate(start);
  return `${formatGameDateShort(start)} – ${formatGameDateShort(end)}`;
}

/**
 * Turn `?range=`/`?from=`/`?to=` into a concrete span. Anything unrecognised or
 * malformed falls back to today, so a hand-edited URL can never 500 the page.
 *
 * Presets are inclusive of today: "past 7 days" means today and the six before
 * it, which is what an operator reading the dashboard at 9pm expects to see.
 */
export function resolveRange(params: {
  range?: string;
  from?: string;
  to?: string;
} = {}): DateRange {
  const today = nyDateString();
  const from = validDate(params.from);
  const to = validDate(params.to);

  // Explicit dates win over a preset, and one date alone means that single day.
  if (from || to) {
    const s = span(from ?? to!, to ?? from!);
    return {
      preset: 'custom',
      ...s,
      label: rangeLabel(s.start, s.end, s.days, today),
    };
  }

  const preset = (params.range ?? 'today') as RangePreset;

  switch (preset) {
    case 'yesterday': {
      const day = addDays(today, -1);
      return { preset, start: day, end: day, days: 1, label: 'Yesterday' };
    }
    case 'last7': {
      const start = addDays(today, -6);
      return { preset, start, end: today, days: 7, label: 'Past 7 days' };
    }
    case 'last30': {
      const start = addDays(today, -29);
      return { preset, start, end: today, days: 30, label: 'Past 30 days' };
    }
    default:
      return { preset: 'today', start: today, end: today, days: 1, label: 'Today' };
  }
}

/** The equally long span ending the day before `range` starts. */
export function previousRange(range: DateRange): DateRange {
  const end = addDays(range.start, -1);
  const start = addDays(end, -(range.days - 1));
  const today = nyDateString();
  return {
    preset: 'custom',
    start,
    end,
    days: range.days,
    label:
      range.days === 1
        ? `vs ${rangeLabel(start, end, 1, today)}`
        : `vs previous ${range.days} days`,
  };
}

/** Signed percentage change, or null when there is no baseline to compare to. */
export function percentChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

/** Everything measured over a chosen span of days. Real players only. */
export type RangeMetrics = {
  starts: number;
  completions: number;
  completionRate: number | null;
  avgCorrect: number | null;
  medianElapsedMs: number | null;
  guestAttempts: number;
  accountAttempts: number;
  newRegistrations: number;
};

/** Numbers an operator actually needs to run the game day to day. */
export type DashboardSummary = {
  today: string;
  todayGame: { id: string; gameNumber: number; status: string } | null;
  tomorrowGame: { id: string; gameNumber: number; status: string } | null;
  publishedFuture: number;
  runwayDays: number;
  lastScheduledDate: string | null;
  /** The span being reported on, and the one it is measured against. */
  range: DateRange;
  previous: DateRange;
  current: RangeMetrics;
  prior: RangeMetrics;
  /** Lifetime totals, which no date range applies to. */
  registeredPlayersTotal: number;
  simulatedAttempts: number;
};

type AttemptStatRow = {
  user_id: string | null;
  completed_at: string | null;
  correct_count: number | null;
  elapsed_ms: number | null;
  is_ranked: boolean;
  integrity_status: string;
};

/**
 * Metrics for one span.
 *
 * Two deliberate decisions here.
 *
 * Simulated rows are excluded unconditionally — no flag, no argument. The
 * `simulated_data` flag exists to pad the *public* leaderboard, and this
 * dashboard is the one place in the app that must never be told that story:
 * "531 guests today" was 531 dummies. The count of fake rows is reported
 * separately, as its own lifetime figure, so it is visible but never mixed in.
 *
 * Attempts are bucketed by when they were *started* (`created_at` inside the New
 * York window), not by which game they belong to. That means an archive play of
 * game #210 lands on the day somebody actually played it, which is what a
 * question like "how did last week go?" is really asking. Ranked metrics still
 * filter on `is_ranked`, so archive plays cannot skew accuracy or completions.
 */
async function metricsForRange(range: DateRange): Promise<RangeMetrics> {
  const db = serviceClient();
  const startInstant = nyMidnightInstant(range.start).toISOString();
  const endInstant = nyMidnightInstant(addDays(range.end, 1)).toISOString();

  const { data: attemptData } = await db
    .from('attempts')
    .select('user_id, completed_at, correct_count, elapsed_ms, is_ranked, integrity_status')
    .eq('is_simulated', false)
    .gte('created_at', startInstant)
    .lt('created_at', endInstant)
    .limit(50_000);

  const rows = (attemptData ?? []) as AttemptStatRow[];

  const starts = rows.length;
  const guestAttempts = rows.filter((r) => !r.user_id).length;
  const accountAttempts = starts - guestAttempts;

  // "Completed" means a finished, ranked, non-flagged attempt — the same bar the
  // leaderboard uses, so the completion rate matches what players can see.
  const completed = rows.filter(
    (r) => r.completed_at && r.is_ranked && r.integrity_status === 'valid',
  );

  const correct = completed
    .map((r) => Number(r.correct_count ?? 0))
    .filter((n) => Number.isFinite(n));
  const times = completed
    .map((r) => Number(r.elapsed_ms))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  const median =
    times.length === 0
      ? null
      : times.length % 2 === 1
        ? times[(times.length - 1) / 2]
        : (times[times.length / 2 - 1] + times[times.length / 2]) / 2;

  const { count: newRegistrations } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startInstant)
    .lt('created_at', endInstant);

  return {
    starts,
    completions: completed.length,
    completionRate: starts > 0 ? (completed.length / starts) * 100 : null,
    avgCorrect: correct.length > 0 ? correct.reduce((a, b) => a + b, 0) / correct.length : null,
    medianElapsedMs: median,
    guestAttempts,
    accountAttempts,
    newRegistrations: newRegistrations ?? 0,
  };
}

export async function getDashboardSummary(
  range: DateRange = resolveRange(),
): Promise<DashboardSummary> {
  const db = serviceClient();
  const today = nyDateString();
  const tomorrow = addDays(today, 1);
  const previous = previousRange(range);

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

  const [current, prior] = await Promise.all([
    metricsForRange(range),
    metricsForRange(previous),
  ]);

  const { count: registeredPlayers } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  const { count: simulatedAttempts } = await db
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('is_simulated', true);

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
    range,
    previous,
    current,
    prior,
    registeredPlayersTotal: registeredPlayers ?? 0,
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
