import 'server-only';
import { serviceClient } from './supabase/admin';
import type { Identity } from './attempts';
import { MAX_PLAUSIBLE_SCORE } from './press-your-luck-math';

export type EndedReason = 'bust' | 'banked';

export type RunRow = {
  id: string;
  user_id: string | null;
  anonymous_session_id: string | null;
  score: number;
  ended_reason: EndedReason;
  created_at: string;
};

export function identityKey(identity: Identity): string | null {
  if (identity.userId) return `u:${identity.userId}`;
  if (identity.anonId) return `a:${identity.anonId}`;
  return null;
}

/**
 * Record one finished run (busted or banked). Returns null if there is no
 * identity at all — shouldn't happen, since `resolveIdentity()` always mints
 * an anonymous id — or if the score fails the sanity ceiling.
 */
export async function recordRun(
  identity: Identity,
  score: number,
  endedReason: EndedReason,
): Promise<RunRow | null> {
  if (!identity.userId && !identity.anonId) return null;
  if (!Number.isFinite(score) || score < 0 || score > MAX_PLAUSIBLE_SCORE) return null;

  const { data, error } = await serviceClient()
    .from('press_your_luck_runs')
    .insert({
      user_id: identity.userId,
      anonymous_session_id: identity.userId ? null : identity.anonId,
      score: Math.round(score),
      ended_reason: endedReason,
    })
    .select()
    .single();

  if (error) return null;
  return data as RunRow;
}

export type LeaderboardRow = {
  rank: number;
  displayName: string;
  score: number;
  isRegistered: boolean;
  achievedAt: string;
};

/**
 * Best run per player, ranked. Aggregation happens in TypeScript rather than
 * SQL — the same call the all-time word-game ladder makes (see
 * `src/lib/all-time.ts`) — so "which run counts" stays in one place and the
 * rule can change without a migration. At arcade-minigame volume this is one
 * indexed read; if that ever stops being true, this is the function to swap
 * for a materialised view keyed on (player).
 */
export async function getLeaderboard(limit = 25): Promise<LeaderboardRow[]> {
  const db = serviceClient();
  const { data } = await db
    .from('press_your_luck_runs')
    .select('user_id, anonymous_session_id, score, created_at')
    .eq('is_simulated', false)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(5000);

  type Row = { user_id: string | null; anonymous_session_id: string | null; score: number; created_at: string };
  const rows = (data ?? []) as Row[];

  const bestByIdentity = new Map<string, Row>();
  for (const row of rows) {
    const key = row.user_id ? `u:${row.user_id}` : row.anonymous_session_id ? `a:${row.anonymous_session_id}` : null;
    if (!key) continue;
    const existing = bestByIdentity.get(key);
    if (!existing || row.score > existing.score) bestByIdentity.set(key, row);
  }

  const best = Array.from(bestByIdentity.values()).sort(
    (a, b) => b.score - a.score || Date.parse(a.created_at) - Date.parse(b.created_at),
  );

  const userIds = best.map((r) => r.user_id).filter((id): id is string => Boolean(id));
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await db
      .from('profiles')
      .select('user_id, display_name, is_banned_name')
      .in('user_id', userIds);
    for (const p of (profiles ?? []) as { user_id: string; display_name: string | null; is_banned_name: boolean }[]) {
      if (p.display_name && !p.is_banned_name) names.set(p.user_id, p.display_name);
    }
  }

  return best.slice(0, limit).map((row, index) => ({
    rank: index + 1,
    // Signed in but no chosen display name yet -> "Player", exactly like the
    // daily leaderboard_page() RPC. No account at all -> "Guest".
    displayName: row.user_id ? names.get(row.user_id) ?? 'Player' : 'Guest',
    score: row.score,
    isRegistered: Boolean(row.user_id),
    achievedAt: row.created_at,
  }));
}

/**
 * This player's own best score and an approximate rank, even if it's off the
 * visible top N. The rank counts *runs* (not distinct players) that beat it —
 * a slight overcount if one other player has many high runs — which is an
 * acceptable approximation for a for-fun arcade counter, not the ranked
 * daily leaderboard.
 */
export async function getMyBest(identity: Identity): Promise<{ score: number; rank: number } | null> {
  const key = identityKey(identity);
  if (!key) return null;
  const db = serviceClient();

  let query = db.from('press_your_luck_runs').select('score').eq('is_simulated', false);
  query = identity.userId
    ? query.eq('user_id', identity.userId)
    : query.eq('anonymous_session_id', identity.anonId as string);
  const { data } = await query.order('score', { ascending: false }).limit(1);
  const myBest = (data ?? [])[0] as { score: number } | undefined;
  if (!myBest) return null;

  const { count } = await db
    .from('press_your_luck_runs')
    .select('id', { count: 'exact', head: true })
    .eq('is_simulated', false)
    .gt('score', myBest.score);

  return { score: myBest.score, rank: Number(count ?? 0) + 1 };
}

/**
 * Bumps this player's activity counter for today by one press — total
 * presses, total busts (== total runs, now that banking is gone), and which
 * UTC hour this press fell in. Purely an admin/analytics aid (see
 * `/admin/press-your-luck` and the migration comment on
 * `press_your_luck_activity`); never read by gameplay logic, so a failure
 * here is swallowed rather than allowed to break a press.
 *
 * A read-then-upsert, not a single atomic increment: at the traffic this
 * game sees (one browser tab pressing sequentially, awaiting each response)
 * the race window is negligible, and it avoids needing a database function
 * just to add small integers together.
 */
export async function recordPressActivity(identity: Identity, busted: boolean): Promise<void> {
  const key = identityKey(identity);
  if (!key) return;

  try {
    const db = serviceClient();
    const now = new Date();
    const activityDate = now.toISOString().slice(0, 10);
    const hour = now.getUTCHours();

    const { data: existing } = await db
      .from('press_your_luck_activity')
      .select('presses, busts, hours_bitmask')
      .eq('identity_key', key)
      .eq('activity_date', activityDate)
      .maybeSingle();

    const row = existing as { presses: number; busts: number; hours_bitmask: number } | null;

    await db.from('press_your_luck_activity').upsert(
      {
        identity_key: key,
        user_id: identity.userId,
        anonymous_session_id: identity.userId ? null : identity.anonId,
        activity_date: activityDate,
        presses: (row?.presses ?? 0) + 1,
        busts: (row?.busts ?? 0) + (busted ? 1 : 0),
        hours_bitmask: (row?.hours_bitmask ?? 0) | (1 << hour),
        last_press_at: now.toISOString(),
      },
      { onConflict: 'identity_key,activity_date' },
    );
  } catch {
    /* analytics only — never let this fail a real press */
  }
}
