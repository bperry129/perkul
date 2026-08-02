import 'server-only';
import { serviceClient } from './supabase/admin';
import {
  buildOptionOrder,
  getArchiveGameById,
  getGameWithRounds,
  getTodaysGame,
  isLive,
  gameSummary,
  toPublicRounds,
  toPublicRoundsFromStoredOrder,
} from './games';
import { flagEnabled, getComparisonSettings } from './flags';
import { resolveComparisonSource, roundStatsAllowed } from './comparison';
import {
  computeStreaks,
  evaluateIntegrity,
  percentileFromRank,
  perkulScore,
  scoreBreakdown,
} from './scoring';

import { gradeFor } from './grades';
import {
  DEFAULT_BENCHMARK_DISTRIBUTION,
  estimateBenchmarkRank,
  type BenchmarkDistribution,
} from './benchmark';
import { buildShareText } from './share';
import { nyDateString } from './time';
import { siteUrl } from './brand';
import type {
  ActiveAttemptPayload,
  AttemptResult,
  GameRecord,
  IntegrityStatus,
  OptionRecord,
  PersonalRecords,
  ResultComparison,
  RoundResult,
  RoundResultOption,
  RoundRecord,
} from './types';

export type Identity = { userId: string | null; anonId: string | null };

export type AttemptRow = {
  id: string;
  game_id: string;
  user_id: string | null;
  anonymous_session_id: string | null;
  mode: 'ranked' | 'practice';
  started_at: string;
  completed_at: string | null;
  elapsed_ms: number | null;
  client_elapsed_ms: number | null;
  correct_count: number | null;
  rounds_total: number;
  is_ranked: boolean;
  completion_status: 'in_progress' | 'completed' | 'abandoned';
  integrity_status: IntegrityStatus;
  integrity_notes: string | null;
  is_simulated: boolean;
  option_order: Record<string, string[]>;
};

export type Failure = { ok: false; code: string; message: string };
export type Success<T> = { ok: true } & T;
export type Outcome<T> = Success<T> | Failure;

const ATTEMPT_COLUMNS =
  'id, game_id, user_id, anonymous_session_id, mode, started_at, completed_at, elapsed_ms, ' +
  'client_elapsed_ms, correct_count, rounds_total, is_ranked, completion_status, ' +
  'integrity_status, integrity_notes, is_simulated, option_order';

function identityFilter<T extends { eq: Function; is: Function }>(query: T, identity: Identity): T {
  if (identity.userId) return query.eq('user_id', identity.userId) as T;
  return query.eq('anonymous_session_id', identity.anonId).is('user_id', null) as T;
}

/** Existing attempt (in progress or completed) for this identity + game. */
export async function findAttemptForIdentity(
  gameId: string,
  identity: Identity,
): Promise<AttemptRow | null> {
  if (!identity.userId && !identity.anonId) return null;
  let query = serviceClient()
    .from('attempts')
    .select(ATTEMPT_COLUMNS)
    .eq('game_id', gameId)
    .eq('is_simulated', false)
    .order('created_at', { ascending: false })
    .limit(5);
  query = identityFilter(query as never, identity);
  const { data } = await query;
  const rows = (data ?? []) as unknown as AttemptRow[];
  if (!rows.length) return null;
  // Prefer an unfinished ranked attempt, then the ranked completion, then latest.
  return (
    rows.find((r) => r.completion_status === 'in_progress' && r.is_ranked) ??
    rows.find((r) => r.is_ranked) ??
    rows[0]
  );
}

/**
 * The newest unfinished UNRANKED attempt on one specific game.
 *
 * Archive replays are unlimited, so this deliberately does not reuse
 * findAttemptForIdentity — that one prefers the ranked row and would happily
 * return a finished replay. This exists only so refreshing mid-replay restores
 * the running clock instead of quietly starting a second attempt.
 */
async function findOpenArchiveAttempt(
  gameId: string,
  identity: Identity,
): Promise<AttemptRow | null> {
  if (!identity.userId && !identity.anonId) return null;
  let query = serviceClient()
    .from('attempts')
    .select(ATTEMPT_COLUMNS)
    .eq('game_id', gameId)
    .eq('is_simulated', false)
    .eq('is_ranked', false)
    .eq('completion_status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1);
  query = identityFilter(query as never, identity);
  const { data } = await query;
  const rows = (data ?? []) as unknown as AttemptRow[];
  return rows[0] ?? null;
}

export async function getAttempt(attemptId: string): Promise<AttemptRow | null> {
  const { data } = await serviceClient()
    .from('attempts')
    .select(ATTEMPT_COLUMNS)
    .eq('id', attemptId)
    .maybeSingle();
  return (data as AttemptRow | null) ?? null;
}

export function ownsAttempt(attempt: AttemptRow, identity: Identity): boolean {
  if (attempt.user_id && identity.userId && attempt.user_id === identity.userId) return true;
  if (
    !attempt.user_id &&
    attempt.anonymous_session_id &&
    identity.anonId &&
    attempt.anonymous_session_id === identity.anonId
  ) {
    return true;
  }
  return false;
}

async function publicPayload(
  attempt: AttemptRow,
  game: GameRecord,
): Promise<ActiveAttemptPayload> {
  const rounds = (game.rounds ?? []) as RoundRecord[];
  const order = attempt.option_order ?? {};
  const publicRounds = Object.keys(order).length
    ? toPublicRoundsFromStoredOrder(rounds, order, attempt.id)
    : toPublicRounds(rounds, attempt.id);

  const { data } = await serviceClient()
    .from('attempt_answers')
    .select('round_id, created_at')
    .eq('attempt_id', attempt.id)
    .order('created_at', { ascending: true });

  return {
    attemptId: attempt.id,
    game: gameSummary(game),
    startedAt: attempt.started_at,
    serverNow: new Date().toISOString(),
    isRanked: attempt.is_ranked,
    mode: attempt.mode,
    rounds: publicRounds,
    answeredRoundIds: ((data ?? []) as Array<{ round_id: string }>).map((r) => r.round_id),
  };
}

/* -------------------------------------------------------------------------- */
/* START                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The timer starts here, server side. The browser's clock is only ever used for
 * a smooth display; the leaderboard time comes from started_at/completed_at as
 * recorded by Postgres/the server.
 */
export async function startAttempt(
  identity: Identity,
  options: {
    gameId?: string | null;
    allowPractice?: boolean;
    /**
     * Set when the game is being played inside a third-party embed. Recorded on
     * the attempt for per-publisher analytics, and — for a guest — the reason
     * the attempt is unranked. See the ranking decision at the end of this
     * function.
     */
    embedPublisherId?: string | null;
  } = {},
): Promise<Outcome<{ payload: ActiveAttemptPayload }>> {

  const game = await getTodaysGame();

  /*
   * ARCHIVE REPLAY. A gameId that isn't today's may still be a published past
   * day, which anyone may replay purely for fun. These attempts are always
   * unranked, are never blocked by an earlier completion, and may be replayed
   * without limit — the two unique indexes on attempts are partial
   * (`where is_ranked`), so repeated unranked rows are legal.
   *
   * getArchiveGameById refuses today and the future, so a guessed id cannot be
   * used to read a puzzle early.
   */
  if (options.gameId && (!game || options.gameId !== game.id)) {
    const archive = await getArchiveGameById(options.gameId);
    if (!archive) {
      return {
        ok: false,
        code: 'expired',
        message: 'That puzzle is not available to play.',
      };
    }
    if (!identity.userId && !identity.anonId) {
      return { ok: false, code: 'no_identity', message: 'Could not establish a play session.' };
    }
    // Restore an unfinished replay rather than starting a second clock.
    const open = await findOpenArchiveAttempt(archive.id, identity);
    if (open) return { ok: true, payload: await publicPayload(open, archive) };
    return createAttempt(identity, archive, {
      ranked: false,
      publisherId: options.embedPublisherId ?? null,
    });
  }


  if (!game) {
    return { ok: false, code: 'no_game', message: 'No game is published for today.' };
  }
  if (!identity.userId && !identity.anonId) {
    return { ok: false, code: 'no_identity', message: 'Could not establish a play session.' };
  }

  const existing = await findAttemptForIdentity(game.id, identity);

  if (existing && existing.completion_status === 'in_progress') {
    // Refresh mid-game: restore, never restart the clock.
    return { ok: true, payload: await publicPayload(existing, game) };
  }

  if (existing && existing.is_ranked && existing.completion_status === 'completed') {
    const practiceAllowed = options.allowPractice ?? (await flagEnabled('practice_replay'));
    if (!practiceAllowed) {
      return {
        ok: false,
        code: 'already_completed',
        message: 'You have already played today’s game.',
      };
    }
    return createAttempt(identity, game, {
      ranked: false,
      publisherId: options.embedPublisherId ?? null,
    });
  }

  /*
   * RANKING, AND WHY AN EMBEDDED GUEST DOES NOT GET IT.
   *
   * A signed-in player is ranked wherever they play — the account is the
   * identity and the usual one-ranked-game-a-day indexes hold.
   *
   * A *guest* inside a third-party embed is a different matter. Their only
   * identity is a CHIPS-partitioned cookie (see embedCookieOptions in
   * session.ts), which by design gives them a fresh id on every publisher
   * site and none at all in Safari or Firefox. Ranking that would put scores
   * on the public leaderboard that we cannot attribute, cannot deduplicate and
   * cannot defend — one reader could farm the board by visiting three news
   * sites, and we would have no way to tell that from three readers.
   *
   * So embedded guests play a real game that simply is not ranked, and the
   * results screen invites them to sign in. That turns the weakness into the
   * funnel: the leaderboard stays trustworthy and signing up is the thing that
   * earns you a place on it.
   */
  const isEmbeddedGuest = Boolean(options.embedPublisherId) && !identity.userId;

  return createAttempt(identity, game, {
    ranked: !isEmbeddedGuest,
    publisherId: options.embedPublisherId ?? null,
  });
}

async function createAttempt(
  identity: Identity,
  game: GameRecord,
  opts: { ranked: boolean; publisherId?: string | null },
): Promise<Outcome<{ payload: ActiveAttemptPayload }>> {

  const id = crypto.randomUUID();
  const rounds = (game.rounds ?? []) as RoundRecord[];
  const publicRounds = toPublicRounds(rounds, id);

  const { data, error } = await serviceClient()
    .from('attempts')
    .insert({
      id,
      game_id: game.id,
      user_id: identity.userId,
      anonymous_session_id: identity.userId ? null : identity.anonId,
      mode: opts.ranked ? 'ranked' : 'practice',
      is_ranked: opts.ranked,
      // Which embed this play came from; null when played on perkul.com.
      publisher_id: opts.publisherId ?? null,
      rounds_total: rounds.length,
      option_order: buildOptionOrder(publicRounds),
      started_at: new Date().toISOString(),
    })
    .select(ATTEMPT_COLUMNS)
    .single();

  if (error || !data) {
    /*
     * Unique index tripped => a concurrent start. Only meaningful for ranked
     * play: the indexes are partial (`where is_ranked`), so an unranked archive
     * insert cannot collide, and resuming here would hand back an unrelated
     * finished replay.
     */
    if (opts.ranked) {
      const existing = await findAttemptForIdentity(game.id, identity);
      if (existing) return { ok: true, payload: await publicPayload(existing, game) };
    }
    return { ok: false, code: 'start_failed', message: 'Could not start the game. Try again.' };
  }

  return { ok: true, payload: await publicPayload(data as unknown as AttemptRow, game) };
}

/** Restore an in-progress attempt after a refresh. */
export async function getActiveAttempt(
  identity: Identity,
): Promise<ActiveAttemptPayload | null> {
  const game = await getTodaysGame();
  if (!game) return null;
  const attempt = await findAttemptForIdentity(game.id, identity);
  if (!attempt || attempt.completion_status !== 'in_progress') return null;
  return publicPayload(attempt, game);
}

/* -------------------------------------------------------------------------- */
/* ANSWER                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One selection per round, first write wins. Correctness is computed and stored
 * server side but NEVER returned: the player finds out after round 10.
 */
export async function recordAnswer(
  attemptId: string,
  identity: Identity,
  input: { roundId: string; optionId: string; elapsedAtMs?: number },
): Promise<Outcome<{ answered: number }>> {
  const attempt = await getAttempt(attemptId);
  if (!attempt || !ownsAttempt(attempt, identity)) {
    return { ok: false, code: 'not_found', message: 'That game session could not be found.' };
  }
  if (attempt.completion_status === 'completed') {
    return { ok: false, code: 'completed', message: 'This attempt is already finished.' };
  }

  const game = await getGameWithRounds(attempt.game_id);
  if (!game) return { ok: false, code: 'no_game', message: 'Game unavailable.' };

  const round = (game.rounds ?? []).find((r) => r.id === input.roundId);
  if (!round) return { ok: false, code: 'bad_round', message: 'Unknown round.' };
  const option = (round.options ?? []).find((o) => o.id === input.optionId);
  if (!option) return { ok: false, code: 'bad_option', message: 'Unknown option.' };

  const order = (attempt.option_order ?? {})[round.id] ?? [];
  const displayPosition = order.indexOf(option.id) + 1 || null;

  const { data: prior } = await serviceClient()
    .from('attempt_answers')
    .select('round_id, selected_option_id, elapsed_at_ms')
    .eq('attempt_id', attempt.id)
    .order('created_at', { ascending: true });
  const priorRows = (prior ?? []) as Array<{
    round_id: string;
    selected_option_id: string;
    elapsed_at_ms: number | null;
  }>;

  const committed = priorRows.find((r) => r.round_id === round.id);
  if (committed) {
    // Re-sending the *same* selection is a harmless retry — networks drop, and
    // the client is allowed to try again. Sending a *different* word is an
    // attempt to change a committed answer, and one choice per round is final.
    if (committed.selected_option_id === option.id) {
      return { ok: true, answered: priorRows.length };
    }
    return {
      ok: false,
      code: 'already_answered',
      message: 'That round is already committed.',
    };
  }

  const lastElapsed = priorRows.length ? priorRows[priorRows.length - 1].elapsed_at_ms ?? 0 : 0;
  const elapsedAt = Math.max(0, Math.round(input.elapsedAtMs ?? 0));

  await serviceClient().from('attempt_answers').insert({
    attempt_id: attempt.id,
    round_id: round.id,
    selected_option_id: option.id,
    display_position: displayPosition,
    elapsed_at_ms: elapsedAt || null,
    response_elapsed_ms: elapsedAt ? Math.max(0, elapsedAt - lastElapsed) : null,
    is_correct: round.fake_option_id === option.id,
  });

  return { ok: true, answered: priorRows.length + 1 };
}

/* -------------------------------------------------------------------------- */
/* COMPLETE                                                                    */
/* -------------------------------------------------------------------------- */

export type SubmittedAnswer = { roundId: string; optionId: string; elapsedAtMs?: number };

/**
 * Idempotent completion. Re-submitting a finished attempt returns the same
 * result rather than rewriting answers — this is what makes the offline retry
 * in the client safe.
 */
export async function completeAttempt(
  attemptId: string,
  identity: Identity,
  answers: SubmittedAnswer[],
  clientElapsedMs?: number,
): Promise<Outcome<{ result: AttemptResult }>> {
  const attempt = await getAttempt(attemptId);
  if (!attempt || !ownsAttempt(attempt, identity)) {
    return { ok: false, code: 'not_found', message: 'That game session could not be found.' };
  }

  const game = await getGameWithRounds(attempt.game_id);
  if (!game) return { ok: false, code: 'no_game', message: 'Game unavailable.' };

  const alreadyCompleted = attempt.completion_status === 'completed';

  if (!alreadyCompleted) {
    const rounds = (game.rounds ?? []) as RoundRecord[];
    const roundById = new Map(rounds.map((r) => [r.id, r]));

    const { data: storedData } = await serviceClient()
      .from('attempt_answers')
      .select('round_id')
      .eq('attempt_id', attempt.id);
    const storedRoundIds = new Set(
      ((storedData ?? []) as Array<{ round_id: string }>).map((r) => r.round_id),
    );

    // Fill in anything the client answered that we have not yet stored.
    let optionsValid = true;
    let runningElapsed = 0;
    const inserts: Record<string, unknown>[] = [];

    for (const answer of answers) {
      const round = roundById.get(answer.roundId);
      if (!round) {
        optionsValid = false;
        continue;
      }
      const option = (round.options ?? []).find((o) => o.id === answer.optionId);
      if (!option) {
        optionsValid = false;
        continue;
      }
      const elapsedAt = Math.max(runningElapsed, Math.round(answer.elapsedAtMs ?? 0));
      const order = (attempt.option_order ?? {})[round.id] ?? [];
      if (!storedRoundIds.has(round.id)) {
        inserts.push({
          attempt_id: attempt.id,
          round_id: round.id,
          selected_option_id: option.id,
          display_position: order.indexOf(option.id) + 1 || null,
          elapsed_at_ms: elapsedAt || null,
          response_elapsed_ms: elapsedAt ? elapsedAt - runningElapsed : null,
          is_correct: round.fake_option_id === option.id,
        });
        storedRoundIds.add(round.id);
      }
      runningElapsed = elapsedAt;
    }

    if (inserts.length) {
      await serviceClient().from('attempt_answers').insert(inserts);
    }

    const { data: finalAnswers } = await serviceClient()
      .from('attempt_answers')
      .select('round_id, is_correct')
      .eq('attempt_id', attempt.id);
    const finalRows = (finalAnswers ?? []) as Array<{ round_id: string; is_correct: boolean }>;

    const completedAt = new Date();
    const elapsedMs = Math.max(
      0,
      completedAt.getTime() - new Date(attempt.started_at).getTime(),
    );
    const correctCount = finalRows.filter((r) => r.is_correct).length;

    const verdict = evaluateIntegrity({
      elapsedMs,
      roundsTotal: attempt.rounds_total,
      answeredRounds: finalRows.length,
      distinctRounds: new Set(finalRows.map((r) => r.round_id)).size,
      optionsValid,
      gameIsLive: isLive(game),
      duplicateCompletion: false,
    });

    const rankedNow = attempt.is_ranked && verdict.status !== 'unranked';

    await serviceClient()
      .from('attempts')
      .update({
        completed_at: completedAt.toISOString(),
        elapsed_ms: elapsedMs,
        client_elapsed_ms: clientElapsedMs ?? null,
        correct_count: correctCount,
        completion_status: 'completed',
        integrity_status: verdict.status,
        integrity_notes: verdict.notes.length ? verdict.notes.join(' ') : null,
        is_ranked: rankedNow,
      })
      .eq('id', attempt.id)
      .is('completed_at', null);
  }

  const result = await buildAttemptResult(attempt.id, identity);
  if (!result) {
    return { ok: false, code: 'result_failed', message: 'Could not build your result.' };
  }
  return { ok: true, result };
}

/* -------------------------------------------------------------------------- */
/* RESULTS                                                                     */
/* -------------------------------------------------------------------------- */

type BenchmarkRow = {
  id: string;
  name: string;
  population_size: number;
  seed: number;
  distribution: BenchmarkDistribution;
  publicly_visible: boolean;
};

export async function getActiveBenchmark(): Promise<BenchmarkRow | null> {
  const { data } = await serviceClient()
    .from('benchmark_versions')
    .select('id, name, population_size, seed, distribution, publicly_visible')
    .eq('active', true)
    .maybeSingle();
  return (data as BenchmarkRow | null) ?? null;
}

/**
 * This is the first and only place answer data crosses to the browser, and it
 * only happens for an attempt that is finished and owned by the caller.
 */
export async function buildAttemptResult(
  attemptId: string,
  identity: Identity,
): Promise<AttemptResult | null> {
  const attempt = await getAttempt(attemptId);
  if (!attempt || !ownsAttempt(attempt, identity)) return null;
  if (attempt.completion_status !== 'completed') return null;

  const game = await getGameWithRounds(attempt.game_id);
  if (!game) return null;

  const { data: answerData } = await serviceClient()
    .from('attempt_answers')
    .select('round_id, selected_option_id, is_correct, response_elapsed_ms')
    .eq('attempt_id', attempt.id);
  const answers = (answerData ?? []) as Array<{
    round_id: string;
    selected_option_id: string;
    is_correct: boolean;
    response_elapsed_ms: number | null;
  }>;
  const answerByRound = new Map(answers.map((a) => [a.round_id, a]));

  const comparisonSettings = await getComparisonSettings();
  const gradesEnabled = await flagEnabled('grades');
  const roundStatsEnabled = await flagEnabled('public_round_stats');
  const includeSimulated = await flagEnabled('simulated_data');

  // When dummy players are on, we always include them in the sample so the
  // 'real' comparison mode activates regardless of how many real players exist.
  const { data: statsData } = await serviceClient().rpc('daily_stats', {
    p_game_id: game.id,
    p_include_simulated: includeSimulated,
  });
  const daily = (Array.isArray(statsData) ? statsData[0] : statsData) as
    | { completions: number }
    | undefined;
  const realSample = Number(daily?.completions ?? 0);

  const benchmark = await getActiveBenchmark();

  // When dummy players are enabled and there are enough players to rank against,
  // always use 'real' mode so the rank shows "#X of Y today" not an estimate.
  const effectiveMode =
    includeSimulated && realSample >= Math.min(comparisonSettings.minimumRealSampleSize, 10)
      ? 'real'
      : comparisonSettings.mode;

  const decision = resolveComparisonSource({
    mode: effectiveMode,
    comparisonsEnabled: comparisonSettings.comparisonsEnabled,
    benchmarkEnabled: comparisonSettings.benchmarkEnabled,
    benchmarkPubliclyVisible: Boolean(benchmark?.publicly_visible),
    realSample,
    minimumRealSampleSize: comparisonSettings.minimumRealSampleSize,
  });

  const useReal = decision.source === 'real';
  const useBenchmark = decision.source === 'benchmark';

  let comparison: ResultComparison = { mode: 'off' };

  if (useReal) {
    const { data: rankData } = await serviceClient().rpc('attempt_rank', {
      p_attempt_id: attempt.id,
      p_include_simulated: includeSimulated,
    });
    const row = (Array.isArray(rankData) ? rankData[0] : rankData) as
      | { rank: number; total: number }
      | undefined;
    const rank = Number(row?.rank ?? 0);
    const total = Number(row?.total ?? 0);
    comparison = {
      mode: 'real',
      rank,
      total,
      beatPercent: Math.round(percentileFromRank(rank, total) * 10) / 10,
      topPercent: total > 0 ? Math.round((rank / total) * 1000) / 10 : null,
      sampleSize: total,
    };
  } else if (useBenchmark && benchmark) {
    const estimate = estimateBenchmarkRank(
      attempt.correct_count ?? 0,
      attempt.elapsed_ms ?? 0,
      benchmark.population_size,
      benchmark.distribution ?? DEFAULT_BENCHMARK_DISTRIBUTION,
    );
    comparison = {
      mode: 'benchmark',
      rank: estimate.rank,
      total: estimate.populationSize,
      beatPercent: estimate.beatPercent,
      topPercent: estimate.topPercent,
      benchmarkPopulation: estimate.populationSize,
      benchmarkName: benchmark.name,
      sampleSize: realSample,
    };
  }

  // Optional per-round selection distribution from legitimate first attempts.
  let statsByOption: Map<string, { selections: number; total: number }> | null = null;
  if (
    roundStatsAllowed({
      publicRoundStatsEnabled: roundStatsEnabled,
      realSample,
      minimumRealSampleSize: comparisonSettings.minimumRealSampleSize,
    })
  ) {
    const { data: roundStats } = await serviceClient().rpc('round_selection_stats', {
      p_game_id: game.id,
      p_include_simulated: includeSimulated,
    });
    statsByOption = new Map();
    for (const row of (roundStats ?? []) as Array<{
      option_id: string;
      selections: number;
      round_total: number;
    }>) {
      statsByOption.set(row.option_id, {
        selections: Number(row.selections),
        total: Number(row.round_total),
      });
    }
  }

  const rounds: RoundResult[] = (game.rounds ?? []).map((round) => {
    const answer = answerByRound.get(round.id);
    const options = (round.options ?? []) as OptionRecord[];
    const fake = options.find((o) => o.id === round.fake_option_id) ?? null;
    const decoy = options.find((o) => o.id === round.intended_decoy_option_id) ?? null;
    const selected = options.find((o) => o.id === answer?.selected_option_id) ?? null;

    const order = (attempt.option_order ?? {})[round.id] ?? options.map((o) => o.id);
    const ordered = order
      .map((id) => options.find((o) => o.id === id))
      .filter((o): o is OptionRecord => Boolean(o));

    const resultOptions: RoundResultOption[] = (ordered.length ? ordered : options).map((o) => {
      const stat = statsByOption?.get(o.id);
      return {
        optionId: o.id,
        word: o.display_word,
        isReal: o.is_real,
        partOfSpeech: o.part_of_speech,
        shortDefinition: o.short_definition,
        expandedDefinition: o.expanded_definition,
        isFake: o.id === round.fake_option_id,
        isIntendedDecoy: o.id === round.intended_decoy_option_id,
        wasSelected: o.id === answer?.selected_option_id,
        selectionPercent:
          stat && stat.total > 0 ? Math.round((stat.selections / stat.total) * 1000) / 10 : null,
      };
    });

    let stats: RoundResult['stats'] = null;
    if (statsByOption) {
      const fakeStat = fake ? statsByOption.get(fake.id) : undefined;
      const total = fakeStat?.total ?? 0;
      const wrong = resultOptions
        .filter((o) => !o.isFake && o.selectionPercent != null)
        .sort((a, b) => (b.selectionPercent ?? 0) - (a.selectionPercent ?? 0))[0];
      if (total > 0) {
        stats = {
          correctPercent: Math.round(((fakeStat?.selections ?? 0) / total) * 1000) / 10,
          sampleSize: total,
          mostCommonWrongWord: wrong?.word ?? null,
          mostCommonWrongPercent: wrong?.selectionPercent ?? null,
        };
      }
    }

    return {
      roundId: round.id,
      roundNumber: round.position,
      difficulty: round.difficulty,
      roundType: round.round_type,
      isCorrect: Boolean(answer?.is_correct),
      responseMs: answer?.response_elapsed_ms ?? null,
      fakeWord: fake?.display_word ?? '—',
      fakeRationale: round.fake_rationale,
      decoyWord: decoy?.display_word ?? null,
      decoyRationale: round.decoy_rationale,
      decoyShortDefinition: decoy?.short_definition ?? null,
      selectedWord: selected?.display_word ?? null,
      options: resultOptions,
      stats,
    };
  });

  const marks = rounds.map((r) => r.isCorrect);
  const correctCount = attempt.correct_count ?? marks.filter(Boolean).length;
  const elapsedMs = attempt.elapsed_ms ?? 0;

  const grade = gradesEnabled
    ? gradeFor({
        correct: correctCount,
        rounds: attempt.rounds_total,
        elapsedMs,
        distribution: benchmark?.distribution ?? DEFAULT_BENCHMARK_DISTRIBUTION,
      })
    : null;

  const records = attempt.user_id ? await buildPersonalRecords(attempt) : null;

  // Recomputed rather than read from attempts.score: the generated column only
  // exists where migrations/20260728120000_score.sql has been applied, and
  // perkulScore() is the very formula it is generated from.
  const points = scoreBreakdown(correctCount, elapsedMs, attempt.rounds_total);

  return {
    attemptId: attempt.id,
    game: gameSummary(game),
    correctCount,
    roundsTotal: attempt.rounds_total,
    elapsedMs,
    score: points.score,
    maxScore: points.maxScore,
    scoreGross: points.gross,
    scorePenalty: points.penalty,
    grade,

    isRanked: attempt.is_ranked,
    integrityStatus: attempt.integrity_status,
    marks,
    rounds,
    comparison,
    records,
    isAuthenticated: Boolean(attempt.user_id),
    shareText: buildShareText({
      gameNumber: game.game_number,
      correctCount,
      roundsTotal: attempt.rounds_total,
      elapsedMs,
      marks,
      grade,
      url: siteUrl('/'),
    }),
  };
}

async function buildPersonalRecords(attempt: AttemptRow): Promise<PersonalRecords | null> {
  if (!attempt.user_id) return null;

  const { data } = await serviceClient()
    .from('attempts')
    .select('id, correct_count, elapsed_ms, rounds_total, completed_at, games!inner(active_date)')
    .eq('user_id', attempt.user_id)
    .eq('is_ranked', true)
    .eq('is_simulated', false)
    .not('completed_at', 'is', null);

  const rows = (data ?? []) as Array<{
    id: string;
    correct_count: number;
    elapsed_ms: number;
    rounds_total: number;
    games: { active_date: string } | { active_date: string }[];
  }>;

  const dates = rows.map((r) =>
    Array.isArray(r.games) ? r.games[0]?.active_date : r.games?.active_date,
  );
  const streaks = computeStreaks(dates.filter(Boolean) as string[], nyDateString());

  const perfect = rows.filter((r) => r.correct_count === r.rounds_total);
  const isPerfect = (attempt.correct_count ?? 0) === attempt.rounds_total;
  const bestPerfect = perfect.length ? Math.min(...perfect.map((p) => p.elapsed_ms)) : null;

  const better = rows.filter(
    (r) =>
      r.id !== attempt.id &&
      (r.correct_count > (attempt.correct_count ?? 0) ||
        (r.correct_count === (attempt.correct_count ?? 0) &&
          r.elapsed_ms < (attempt.elapsed_ms ?? 0))),
  );

  return {
    isFirstPerfect: isPerfect && perfect.length === 1,
    isPersonalBestPerfect:
      isPerfect && bestPerfect != null && (attempt.elapsed_ms ?? 0) <= bestPerfect,
    isBestScore: better.length === 0 && rows.length > 1,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    gamesPlayed: rows.length,
  };
}

/* -------------------------------------------------------------------------- */
/* CLAIMING A GUEST RESULT                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Server-side claim: we take the anonymous session id from the signed httpOnly
 * cookie, never an attempt id supplied by the browser. If the account already
 * has a ranked attempt for that game, the guest row is downgraded to practice
 * so the one-ranked-attempt rule holds.
 */
export async function claimAnonymousAttempts(
  userId: string,
  anonId: string | null,
): Promise<{ claimed: number }> {
  if (!anonId) return { claimed: 0 };
  const db = serviceClient();

  const { data } = await db
    .from('attempts')
    .select('id, game_id, is_ranked')
    .eq('anonymous_session_id', anonId)
    .is('user_id', null);

  const rows = (data ?? []) as Array<{ id: string; game_id: string; is_ranked: boolean }>;
  if (!rows.length) return { claimed: 0 };

  const { data: ownedData } = await db
    .from('attempts')
    .select('game_id')
    .eq('user_id', userId)
    .eq('is_ranked', true);
  const owned = new Set(
    ((ownedData ?? []) as Array<{ game_id: string }>).map((r) => r.game_id),
  );

  let claimed = 0;
  for (const row of rows) {
    const conflicts = row.is_ranked && owned.has(row.game_id);
    const { error } = await db
      .from('attempts')
      .update({
        user_id: userId,
        anonymous_session_id: null,
        is_ranked: conflicts ? false : row.is_ranked,
        mode: conflicts ? 'practice' : undefined,
      })
      .eq('id', row.id);
    if (!error) {
      claimed += 1;
      if (row.is_ranked && !conflicts) owned.add(row.game_id);
    }
  }

  return { claimed };
}

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

export type HistoryRow = {
  attemptId: string;
  gameNumber: number;
  activeDate: string;
  correctCount: number;
  roundsTotal: number;
  elapsedMs: number;
  isRanked: boolean;
};

export async function getPlayerHistory(userId: string, limit = 30): Promise<HistoryRow[]> {
  const { data } = await serviceClient()
    .from('attempts')
    .select(
      'id, correct_count, elapsed_ms, rounds_total, is_ranked, completed_at, games!inner(game_number, active_date)',
    )
    .eq('user_id', userId)
    .eq('is_simulated', false)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const game = (Array.isArray(row.games) ? row.games[0] : row.games) as {
      game_number: number;
      active_date: string;
    };
      return {
      attemptId: row.id as string,
      gameNumber: game.game_number,
      activeDate: game.active_date,
      correctCount: (row.correct_count as number) ?? 0,
      roundsTotal: (row.rounds_total as number) ?? 10,
      elapsedMs: (row.elapsed_ms as number) ?? 0,
      isRanked: Boolean(row.is_ranked),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Archive play — counted for the player, never for the ladder                 */
/* -------------------------------------------------------------------------- */

export type ArchiveStats = {
  played: number;
  distinctGames: number;
  perfect: number;
  totalCorrect: number;
  totalRounds: number;
  bestScore: number | null;
};

/**
 * Counters for a player's archive (unranked) games.
 *
 * Kept deliberately separate from player_lifetime_stats, which filters on
 * `is_ranked` — archive play must never move a lifetime average, an accuracy
 * figure or a streak. It is its own scoreboard, shown in its own section.
 */
export async function getArchiveStats(userId: string): Promise<ArchiveStats> {
  const { data } = await serviceClient()
    .from('attempts')
    .select('game_id, correct_count, rounds_total, elapsed_ms')
    .eq('user_id', userId)
    .eq('is_ranked', false)
    .eq('is_simulated', false)
    .not('completed_at', 'is', null);

  const rows = (data ?? []) as Array<{
    game_id: string;
    correct_count: number | null;
    rounds_total: number | null;
    elapsed_ms: number | null;
  }>;

  const empty: ArchiveStats = {
    played: 0,
    distinctGames: 0,
    perfect: 0,
    totalCorrect: 0,
    totalRounds: 0,
    bestScore: null,
  };
  if (!rows.length) return empty;

  let totalCorrect = 0;
  let totalRounds = 0;
  let perfect = 0;
  let bestScore = 0;
  const games = new Set<string>();

  for (const row of rows) {
    const correct = row.correct_count ?? 0;
    const rounds = row.rounds_total ?? 10;
    totalCorrect += correct;
    totalRounds += rounds;
    if (correct === rounds) perfect += 1;
    games.add(row.game_id);
    bestScore = Math.max(bestScore, perkulScore(correct, row.elapsed_ms ?? 0));
  }

  return {
    played: rows.length,
    distinctGames: games.size,
    perfect,
    totalCorrect,
    totalRounds,
    bestScore,
  };
}

/* -------------------------------------------------------------------------- */
/* Challenge links                                                             */
/* -------------------------------------------------------------------------- */

export type ChallengeInfo = {
  displayName: string;
  score: number;
  correctCount: number;
  elapsedMs: number;
};

/**
 * Returns the public-facing information for a challenge banner.
 * No ownership check: we expose only score + name, which is public
 * leaderboard data.  Returns null if the attempt cannot be found or is
 * not completed/ranked.
 */
export async function getChallengeInfo(attemptId: string): Promise<ChallengeInfo | null> {
  if (!attemptId) return null;

  const db = serviceClient();

  const { data: row } = await db
    .from('attempts')
    .select('id, user_id, score, correct_count, elapsed_ms, completion_status, is_ranked, integrity_status, display_name_override')
    .eq('id', attemptId)
    .eq('completion_status', 'completed')
    .eq('is_ranked', true)
    .maybeSingle();

  if (!row) return null;

  const r = row as Record<string, unknown>;

  // Resolve display name: override → profile → Guest
  let displayName = 'a friend';
  if (r.display_name_override) {
    displayName = r.display_name_override as string;
  } else if (r.user_id) {
    const { data: profile } = await db
      .from('profiles')
      .select('display_name')
      .eq('user_id', r.user_id)
      .maybeSingle();
    const p = profile as Record<string, unknown> | null;
    if (p?.display_name) displayName = p.display_name as string;
  }

  const correctCount = Number(r.correct_count ?? 0);
  const elapsedMs = Number(r.elapsed_ms ?? 0);
  const score =
    r.score != null
      ? Number(r.score)
      : perkulScore(correctCount, elapsedMs);

  return { displayName, score, correctCount, elapsedMs };
}
