import 'server-only';
import { serviceClient } from './supabase/admin';
import { flagEnabled } from './flags';
import { perkulScore } from './scoring';
import { MIN_GAMES_FOR_AVERAGE, minGamesFor, rankAllTime } from './all-time-rank';
import type { AllTimeMetric } from './all-time-rank';
import type { Identity } from './attempts';

export { MIN_GAMES_FOR_AVERAGE };
export type { AllTimeMetric };

/**
 * ALL-TIME LEADERBOARDS
 *
 * The daily board answers "who won today". These two answer "who is good at
 * this game", and they deliberately answer it twice:
 *
 *  - **Smartest Players** ranks by *average* score per game, so someone who
 *    plays twice a week and scores well is not buried under someone who
 *    grinds every day. It is the K:D ratio of Perkul, and like a K:D ratio it
 *    needs a floor to mean anything: MIN_GAMES_FOR_AVERAGE completed games.
 *    This is the default tab.
 *  - **Total Points** ranks by accumulated score across every game played, so
 *    consistency and volume still get their own trophy.
 *
 * Both are computed from the same eligible attempt set as the daily board
 * (ranked, completed, integrity `valid`, opted in), and both use the exact
 * same `perkulScore()` per game — no second scoring rule is introduced here.
 *
 * Aggregation happens in TypeScript rather than SQL on purpose: the score
 * formula then lives in exactly one place (`src/lib/scoring.ts`) and this
 * feature needs no new migration to go live. At Perkul's scale (one game a
 * day, a few hundred ranked attempts each) that is a single indexed read.
 *
 * The ordering and the games-played floor are pure and live in
 * `./all-time-rank`, which is what the test suite asserts against.
 */

/** Hard ceiling on rows pulled into memory for the aggregate. */
const MAX_ATTEMPT_ROWS = 50_000;
const PAGE = 1_000;

export type AllTimeRow = {
  rank: number;
  /** Stable identity of the player across games (never rendered). */
  playerKey: string;
  displayName: string;
  gamesPlayed: number;
  totalScore: number;
  /** Total score / games played. The Smartest Players number. */
  averageScore: number;
  bestScore: number;
  totalCorrect: number;
  isRegistered: boolean;
  isSimulated: boolean;
  isYou?: boolean;
};

export type AllTimeBoard = {
  metric: AllTimeMetric;
  rows: AllTimeRow[];
  /** Everyone with at least one eligible game. */
  totalPlayers: number;
  /** Distinct games that contributed to the board. */
  gamesCounted: number;
  minGames: number;
  /** The viewer's row, if they qualify for this board. */
  you: AllTimeRow | null;
  /** The viewer's completed game count, even when they do not qualify yet. */
  yourGamesPlayed: number;
  includesSimulated: boolean;
};

type AttemptRow = {
  id: string;
  game_id: string;
  user_id: string | null;
  anonymous_session_id: string | null;
  display_name_override: string | null;
  correct_count: number | null;
  elapsed_ms: number | null;
  score: number | null;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  is_banned_name: boolean | null;
  leaderboard_opt_in: boolean | null;
};

type Accumulator = {
  playerKey: string;
  userId: string | null;
  fallbackName: string | null;
  isRegistered: boolean;
  isSimulated: boolean;
  /** Best score per game, so a stray second attempt can never double-count. */
  bestByGame: Map<string, { score: number; correct: number }>;
};

/**
 * How an attempt is attributed to a player across days:
 *   1. an account (the only identity that truly persists),
 *   2. an anonymous session cookie (survives days on one device),
 *   3. a simulated player's name (dummy players have no session).
 * Anything else is an unattributable guest and is left off the all-time board
 * rather than being merged into one meaningless "Guest" row.
 */
function playerKeyFor(row: AttemptRow): string | null {
  if (row.user_id) return `user:${row.user_id}`;
  if (row.anonymous_session_id) return `anon:${row.anonymous_session_id}`;
  const name = row.display_name_override?.trim();
  if (name) return `name:${name.toLowerCase()}`;
  return null;
}

/** The viewer's key, built with the same rules so "you" highlights correctly. */
export function identityPlayerKey(identity: Identity): string | null {
  if (identity.userId) return `user:${identity.userId}`;
  if (identity.anonId) return `anon:${identity.anonId}`;
  return null;
}

function scoreOf(row: AttemptRow): number {
  if (row.score != null) return Number(row.score);
  return perkulScore(Number(row.correct_count ?? 0), Number(row.elapsed_ms ?? 0));
}

async function loadEligibleAttempts(includeSimulated: boolean): Promise<AttemptRow[]> {
  const db = serviceClient();
  const rows: AttemptRow[] = [];

  for (let from = 0; from < MAX_ATTEMPT_ROWS; from += PAGE) {
    let query = db
      .from('attempts')
      .select(
        'id, game_id, user_id, anonymous_session_id, display_name_override, correct_count, elapsed_ms, score',
      )
      .eq('is_ranked', true)
      .eq('completion_status', 'completed')
      .eq('integrity_status', 'valid')
      .not('completed_at', 'is', null)
      // Stable order so paging cannot skip or repeat a row mid-scan.
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (!includeSimulated) query = query.eq('is_simulated', false);

    const { data, error } = await query;
    if (error) throw new Error(`Could not read all-time attempts: ${error.message}`);
    const batch = (data ?? []) as AttemptRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  return rows;
}

async function loadProfiles(): Promise<Map<string, ProfileRow>> {
  const db = serviceClient();
  const map = new Map<string, ProfileRow>();

  for (let from = 0; from < MAX_ATTEMPT_ROWS; from += PAGE) {
    const { data, error } = await db
      .from('profiles')
      .select('user_id, display_name, is_banned_name, leaderboard_opt_in')
      .order('user_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read profiles: ${error.message}`);
    const batch = (data ?? []) as ProfileRow[];
    for (const row of batch) map.set(row.user_id, row);
    if (batch.length < PAGE) break;
  }

  return map;
}

export async function getAllTimeLeaderboard(options: {
  metric: AllTimeMetric;
  limit?: number;
  identity?: Identity | null;
  includeSimulated?: boolean;
}): Promise<AllTimeBoard> {
  const metric = options.metric;
  const limit = Math.min(1_000, Math.max(10, options.limit ?? 250));
  const minGames = minGamesFor(metric);
  const includeSimulated = options.includeSimulated ?? (await flagEnabled('simulated_data'));

  const [attempts, profiles] = await Promise.all([
    loadEligibleAttempts(includeSimulated),
    loadProfiles(),
  ]);

  const byPlayer = new Map<string, Accumulator>();
  const games = new Set<string>();

  for (const attempt of attempts) {
    const key = playerKeyFor(attempt);
    if (!key) continue;

    // A player who has opted out of the leaderboard stays off every board.
    if (attempt.user_id) {
      const profile = profiles.get(attempt.user_id);
      if (profile && profile.leaderboard_opt_in === false) continue;
    }

    games.add(attempt.game_id);

    let acc = byPlayer.get(key);
    if (!acc) {
      acc = {
        playerKey: key,
        userId: attempt.user_id ?? null,
        fallbackName: attempt.display_name_override?.trim() || null,
        isRegistered: Boolean(attempt.user_id),
        isSimulated: !attempt.user_id && !attempt.anonymous_session_id,
        bestByGame: new Map(),
      };
      byPlayer.set(key, acc);
    }

    const score = scoreOf(attempt);
    const correct = Number(attempt.correct_count ?? 0);
    const existing = acc.bestByGame.get(attempt.game_id);
    if (!existing || score > existing.score) {
      acc.bestByGame.set(attempt.game_id, { score, correct });
    }
  }

  const all: AllTimeRow[] = [];
  for (const acc of byPlayer.values()) {
    const entries = [...acc.bestByGame.values()];
    const gamesPlayed = entries.length;
    if (gamesPlayed === 0) continue;

    const totalScore = entries.reduce((sum, e) => sum + e.score, 0);
    const totalCorrect = entries.reduce((sum, e) => sum + e.correct, 0);
    const bestScore = entries.reduce((max, e) => Math.max(max, e.score), 0);

    const profile = acc.userId ? profiles.get(acc.userId) : undefined;
    const displayName =
      profile?.display_name && !profile.is_banned_name
        ? profile.display_name
        : acc.fallbackName ?? (acc.isRegistered ? 'Player' : 'Guest');

    all.push({
      rank: 0,
      playerKey: acc.playerKey,
      displayName,
      gamesPlayed,
      totalScore,
      averageScore: totalScore / gamesPlayed,
      bestScore,
      totalCorrect,
      isRegistered: acc.isRegistered,
      isSimulated: acc.isSimulated,
    });
  }

  const myKey = options.identity ? identityPlayerKey(options.identity) : null;
  const yourGamesPlayed = myKey ? all.find((r) => r.playerKey === myKey)?.gamesPlayed ?? 0 : 0;

  const eligible = rankAllTime(all, metric, minGames);

  let you: AllTimeRow | null = null;
  const rows = eligible.slice(0, limit).map((row) => {
    if (myKey && row.playerKey === myKey) {
      you = { ...row, isYou: true };
      return you;
    }
    return row;
  });

  // Ranked but off the visible page: still tell the player where they stand.
  if (!you && myKey) {
    const mine = eligible.find((row) => row.playerKey === myKey);
    if (mine) you = { ...mine, isYou: true };
  }

  return {
    metric,
    rows,
    totalPlayers: eligible.length,
    gamesCounted: games.size,
    minGames,
    you,
    yourGamesPlayed,
    includesSimulated: includeSimulated,
  };
}
