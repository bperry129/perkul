import 'server-only';
import { cache } from 'react';
import { serviceClient } from './supabase/admin';
import { nyDateString, addDays, diffDays } from './time';
import type { DerivedGameStatus, GameRecord, PublicGameSummary } from './types';

// Browser-safe payload builders live in their own pure module so the test suite
// can assert that answer data cannot escape through them.
export {
  toPublicRounds,
  toPublicRoundsFromStoredOrder,
  buildOptionOrder,
} from './public-payload';

// `rounds` and `round_options` are joined by three foreign keys: the child
// pointer (round_options.round_id) plus the two answer-key pointers on rounds
// (fake_option_id, intended_decoy_option_id). PostgREST refuses an ambiguous
// embed (PGRST201), so the child relationship must be named explicitly.
const ROUND_SELECT = `
  id, game_id, position, difficulty, round_type, fake_option_id,
  intended_decoy_option_id, fake_rationale, decoy_rationale, editor_notes,
  approved, quality_checklist,
  options:round_options!round_options_round_id_fkey (
    id, round_id, lexicon_entry_id, position, display_word, normalized_word,
    is_real, part_of_speech, short_definition, expanded_definition
  )
`;

const GAME_SELECT = `
  id, game_number, active_date, status, difficulty_label, editor_notes,
  published_at, source_batch_id
`;

function sortGame(game: GameRecord): GameRecord {
  const rounds = (game.rounds ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((round) => ({
      ...round,
      options: (round.options ?? []).slice().sort((a, b) => a.position - b.position),
    }));
  return { ...game, rounds };
}

/**
 * A failed game lookup is an operational incident, not an empty day. Log it so
 * it shows up in server logs instead of silently rendering "no puzzle today".
 */
function logLookupFailure(where: string, error: { message: string; code?: string }): void {
  console.error(`[perkul] game lookup failed in ${where}: ${error.code ?? '?'} ${error.message}`);
}

/** Full editorial record. Server only — contains the answer key. */
export async function getGameWithRounds(gameId: string): Promise<GameRecord | null> {
  const { data, error } = await serviceClient()
    .from('games')
    .select(`${GAME_SELECT}, rounds (${ROUND_SELECT})`)
    .eq('id', gameId)
    .maybeSingle();
  if (error) logLookupFailure('getGameWithRounds', error);
  if (error || !data) return null;
  return sortGame(data as unknown as GameRecord);
}

export async function getGameByDateWithRounds(activeDate: string): Promise<GameRecord | null> {
  const { data, error } = await serviceClient()
    .from('games')
    .select(`${GAME_SELECT}, rounds (${ROUND_SELECT})`)
    .eq('active_date', activeDate)
    .maybeSingle();
  if (error) logLookupFailure('getGameByDateWithRounds', error);
  if (error || !data) return null;
  return sortGame(data as unknown as GameRecord);
}

/**
 * The current daily game is a pure function of the New York calendar date.
 * No cron job is needed to "switch" games: at 12:00 AM America/New_York the
 * date changes and this lookup resolves to the next published game.
 */
export const getTodaysGame = cache(async (): Promise<GameRecord | null> => {
  const today = nyDateString();
  const game = await getGameByDateWithRounds(today);
  if (!game) return null;
  if (game.status !== 'published') return null;
  return game;
});

export type DatabaseProbe =
  | { ok: true }
  | { ok: false; reason: 'unreachable' | 'schema_missing'; detail: string };

/**
 * Used by empty states to tell "the database isn't set up" apart from
 * "no game is published for today". Two very different problems, and the player
 * should never see a setup problem dressed up as a missing puzzle.
 */
export const probeDatabase = cache(async (): Promise<DatabaseProbe> => {
  try {
    const { error } = await serviceClient()
      .from('games')
      .select('id', { count: 'exact', head: true });
    if (!error) return { ok: true };
    // 42P01 = undefined_table: connected, but the migration has not been run.
    const missing = error.code === '42P01' || /does not exist/i.test(error.message);
    return {
      ok: false,
      reason: missing ? 'schema_missing' : 'unreachable',
      detail: error.message,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'unreachable',
      detail: err instanceof Error ? err.message : 'Unknown connection failure',
    };
  }
});

export const getTodaysGameSummary = cache(async (): Promise<PublicGameSummary | null> => {
  const today = nyDateString();
  const { data, error } = await serviceClient()
    .from('games')
    .select('id, game_number, active_date, status')
    .eq('active_date', today)
    .eq('status', 'published')
    .maybeSingle();
  if (error || !data) return null;
  return {
    gameId: data.id as string,
    gameNumber: data.game_number as number,
    activeDate: data.active_date as string,
    roundCount: 10,
  };
});

export function gameSummary(game: GameRecord): PublicGameSummary {
  return {
    gameId: game.id,
    gameNumber: game.game_number,
    activeDate: game.active_date,
    roundCount: game.rounds?.length ?? 10,
  };
}

export function derivedStatus(game: Pick<GameRecord, 'status' | 'active_date'>): DerivedGameStatus {
  const today = nyDateString();
  if (game.status === 'published' && game.active_date === today) return 'live';
  if (game.status === 'published' && game.active_date < today) return 'expired';
  return game.status;
}

export function isLive(game: Pick<GameRecord, 'status' | 'active_date'>): boolean {
  return game.status === 'published' && game.active_date === nyDateString();
}

/* -------------------------------------------------------------------------- */
/* Admin: bank listing + runway                                               */
/* -------------------------------------------------------------------------- */

export type GameBankRow = {
  id: string;
  game_number: number;
  active_date: string;
  status: GameRecord['status'];
  derived: DerivedGameStatus;
  round_count: number;
  approved_rounds: number;
};

export async function listGameBank(): Promise<GameBankRow[]> {
  const { data, error } = await serviceClient()
    .from('games')
    .select('id, game_number, active_date, status, rounds (id, approved)')
    .order('active_date', { ascending: true });
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => {
    const rounds = (row.rounds ?? []) as Array<{ id: string; approved: boolean }>;
    return {
      id: row.id as string,
      game_number: row.game_number as number,
      active_date: row.active_date as string,
      status: row.status as GameRecord['status'],
      derived: derivedStatus({
        status: row.status as GameRecord['status'],
        active_date: row.active_date as string,
      }),
      round_count: rounds.length,
      approved_rounds: rounds.filter((r) => r.approved).length,
    };
  });
}

export type RunwayInfo = {
  today: string;
  scheduledFuture: number;
  lastScheduledDate: string | null;
  runwayDays: number;
  nextUnusedDate: string;
  warning: boolean;
};

export async function getRunway(): Promise<RunwayInfo> {
  const today = nyDateString();
  const { data } = await serviceClient()
    .from('games')
    .select('active_date, status')
    .order('active_date', { ascending: false });

  const rows = (data ?? []) as Array<{ active_date: string; status: string }>;
  const published = rows.filter((r) => r.status === 'published');
  const futurePublished = published.filter((r) => r.active_date >= today);
  const lastScheduledDate = published.length ? published[0].active_date : null;
  const anyLast = rows.length ? rows[0].active_date : null;

  const runwayDays = lastScheduledDate
    ? Math.max(0, diffDays(today, lastScheduledDate) + 1)
    : 0;

  return {
    today,
    scheduledFuture: futurePublished.length,
    lastScheduledDate,
    runwayDays,
    nextUnusedDate: anyLast ? addDays(anyLast, 1) : today,
    warning: runwayDays < 7,
  };
}

export async function getNextGameNumber(): Promise<number> {
  const { data } = await serviceClient()
    .from('games')
    .select('game_number')
    .order('game_number', { ascending: false })
    .limit(1);
  const rows = (data ?? []) as Array<{ game_number: number }>;
  return rows.length ? rows[0].game_number + 1 : 1;
}
