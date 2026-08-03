import 'server-only';
import { serviceClient } from './supabase/admin';

/** Any single day with presses spread across this many distinct hours (out
 * of 24) gets flagged for manual review — a human playing an arcade game for
 * a few minutes a day does not rack up presses at 3am, 9am, and every hour
 * in between. */
const SUSPICIOUS_HOURS_THRESHOLD = 18;

export type PressYourLuckPlayerRow = {
  identityKey: string;
  userId: string | null;
  anonymousSessionId: string | null;
  displayName: string;
  isRegistered: boolean;
  totalRuns: number;
  totalPresses: number;
  bestScore: number;
  lastPressAt: string | null;
  maxHoursInADay: number;
  flagged: boolean;
};

export type PressYourLuckAnalytics = {
  totals: { runs: number; presses: number; players: number; flagged: number };
  players: PressYourLuckPlayerRow[];
};

function popcount(n: number): number {
  let count = 0;
  let v = n;
  while (v) {
    count += v & 1;
    v >>>= 1;
  }
  return count;
}

/**
 * Aggregates `press_your_luck_activity` (per-identity, per-day counters) and
 * `press_your_luck_runs` (best score) into one row per player for the admin
 * dashboard: how many runs, how many total presses, and — the thing that
 * actually matters for catching abuse of the giveaway — the busiest single
 * day's spread of activity across the 24-hour clock.
 */
export async function getPressYourLuckAnalytics(): Promise<PressYourLuckAnalytics> {
  const db = serviceClient();

  const [{ data: activity }, { data: runs }] = await Promise.all([
    db
      .from('press_your_luck_activity')
      .select('identity_key, user_id, anonymous_session_id, presses, busts, hours_bitmask, last_press_at')
      .order('last_press_at', { ascending: false })
      .limit(10000),
    db
      .from('press_your_luck_runs')
      .select('user_id, anonymous_session_id, score')
      .eq('is_simulated', false)
      .limit(20000),
  ]);

  type ActivityRow = {
    identity_key: string;
    user_id: string | null;
    anonymous_session_id: string | null;
    presses: number;
    busts: number;
    hours_bitmask: number;
    last_press_at: string | null;
  };

  const byIdentity = new Map<
    string,
    {
      userId: string | null;
      anonymousSessionId: string | null;
      totalPresses: number;
      totalRuns: number;
      lastPressAt: string | null;
      maxHours: number;
    }
  >();

  for (const row of (activity ?? []) as ActivityRow[]) {
    const hours = popcount(row.hours_bitmask);
    const existing = byIdentity.get(row.identity_key);
    if (existing) {
      existing.totalPresses += row.presses;
      existing.totalRuns += row.busts;
      existing.maxHours = Math.max(existing.maxHours, hours);
      if (row.last_press_at && (!existing.lastPressAt || row.last_press_at > existing.lastPressAt)) {
        existing.lastPressAt = row.last_press_at;
      }
    } else {
      byIdentity.set(row.identity_key, {
        userId: row.user_id,
        anonymousSessionId: row.anonymous_session_id,
        totalPresses: row.presses,
        totalRuns: row.busts,
        lastPressAt: row.last_press_at,
        maxHours: hours,
      });
    }
  }

  const bestScore = new Map<string, number>();
  for (const r of (runs ?? []) as { user_id: string | null; anonymous_session_id: string | null; score: number }[]) {
    const key = r.user_id ? `u:${r.user_id}` : r.anonymous_session_id ? `a:${r.anonymous_session_id}` : null;
    if (!key) continue;
    bestScore.set(key, Math.max(bestScore.get(key) ?? 0, r.score));
  }

  const userIds = Array.from(byIdentity.values())
    .map((v) => v.userId)
    .filter((id): id is string => Boolean(id));
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await db.from('profiles').select('user_id, display_name').in('user_id', userIds);
    for (const p of (profiles ?? []) as { user_id: string; display_name: string | null }[]) {
      if (p.display_name) names.set(p.user_id, p.display_name);
    }
  }

  const players: PressYourLuckPlayerRow[] = Array.from(byIdentity.entries())
    .map(([key, v]) => ({
      identityKey: key,
      userId: v.userId,
      anonymousSessionId: v.anonymousSessionId,
      displayName: v.userId ? names.get(v.userId) ?? 'Player' : 'Guest',
      isRegistered: Boolean(v.userId),
      totalRuns: v.totalRuns,
      totalPresses: v.totalPresses,
      bestScore: bestScore.get(key) ?? 0,
      lastPressAt: v.lastPressAt,
      maxHoursInADay: v.maxHours,
      flagged: v.maxHours >= SUSPICIOUS_HOURS_THRESHOLD,
    }))
    .sort((a, b) => b.totalPresses - a.totalPresses);

  const totals = {
    runs: players.reduce((sum, p) => sum + p.totalRuns, 0),
    presses: players.reduce((sum, p) => sum + p.totalPresses, 0),
    players: players.length,
    flagged: players.filter((p) => p.flagged).length,
  };

  return { totals, players };
}
