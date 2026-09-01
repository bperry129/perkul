'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminGuard } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { getGameWithRounds, getNextGameNumber, getRunway } from '@/lib/games';
import { gameRecordToDraft, logAdminAction, saveDraftGames, setGameStatus } from '@/lib/persist';
import { getHistoryContext, historyWithout, updateLexiconEntry } from '@/lib/lexicon';
import { validateBank, validateGame, summarizeBank } from '@/lib/validation';
import { parseBankText } from '@/lib/import-schema';
import { buildGenerationPrompt } from '@/lib/prompt';
import { setFlag } from '@/lib/flags';
import { deleteSimulatedAttempts, generateSimulatedAttempts, countSimulatedAttempts } from '@/lib/simulate';
import { normalizeWord } from '@/lib/content/draft';
import { generatePublisherKey } from '@/lib/publisher-admin';
import { checkAttributionForPublisher } from '@/lib/attribution';
import { normalizeOrigin } from '@/lib/publishers';
import type { GameStatus, RoundType } from '@/lib/types';


/**
 * Every action re-checks admin authorisation on the server. Hiding a button is
 * not authorisation.
 */
async function guard(): Promise<string> {
  const { ok, userId } = await adminGuard();
  if (!ok) throw new Error('Not authorised.');
  return userId as string;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function num(formData: FormData, key: string, fallback = 0): number {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : fallback;
}

/* -------------------------------------------------------------------------- */
/* Game status / validation                                                    */
/* -------------------------------------------------------------------------- */

export async function validateGameAction(formData: FormData) {
  await guard();
  const gameId = str(formData, 'gameId');
  revalidatePath(`/admin/games/${gameId}`);
}

export async function setGameStatusAction(formData: FormData) {
  const adminId = await guard();
  const gameId = str(formData, 'gameId');
  const status = str(formData, 'status') as GameStatus;
  // Editorial override: lets an admin push a game to ready/published despite
  // validator errors (e.g. a reused word) after consciously acknowledging it.
  const force = formData.get('force') === 'true';

  if ((status === 'ready' || status === 'published') && !force) {
    const game = await getGameWithRounds(gameId);
    if (!game) throw new Error('Game not found.');
    const draft = gameRecordToDraft(game);
    const history = historyWithout(await getHistoryContext(), [draft]);
    const report = validateGame(draft, history);
    if (!report.ok) {
      redirect(`/admin/games/${gameId}?blocked=1`);
    }
  }

  await setGameStatus(gameId, status);
  await logAdminAction(adminId, 'game.status', 'game', gameId, { status, forced: force });


  // Auto-generate dummy players when a game is published.
  if (status === 'published') {
    const { flagEnabled } = await import('@/lib/flags');
    if (await flagEnabled('simulated_data')) {
      const existing = await countSimulatedAttempts(gameId);
      if (existing === 0) {
        // Random between 200-500 to vary the daily count
        const count = 200 + Math.floor(Math.random() * 301);
        try {
          await generateSimulatedAttempts(gameId, count);
        } catch {
          // Non-fatal: game still publishes even if dummy generation fails
        }
      }
    }
  }

  revalidatePath('/admin/games');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath('/admin/dummy-players');
  revalidatePath('/');
  revalidatePath('/leaderboard');
}

export async function approveRoundAction(formData: FormData) {
  const adminId = await guard();
  const roundId = str(formData, 'roundId');
  const gameId = str(formData, 'gameId');
  const approved = formData.get('approved') === 'on' || formData.get('approved') === 'true';

  const checklist = {
    fake_plausible: formData.get('q_fake') === 'on',
    decoy_tricky: formData.get('q_decoy') === 'on',
    three_anchors: formData.get('q_anchors') === 'on',
    no_archaic: formData.get('q_archaic') === 'on',
    no_jargon: formData.get('q_jargon') === 'on',
    definitions_good: formData.get('q_definitions') === 'on',
    explanation_interesting: formData.get('q_explanation') === 'on',
    distinct_from_recent: formData.get('q_distinct') === 'on',
    fair: formData.get('q_fair') === 'on',
  };

  await serviceClient()
    .from('rounds')
    .update({ approved, quality_checklist: checklist })
    .eq('id', roundId);

  await logAdminAction(adminId, 'round.approve', 'round', roundId, { approved, checklist });
  revalidatePath(`/admin/games/${gameId}`);
}

export async function saveRoundAction(formData: FormData) {
  const adminId = await guard();
  const roundId = str(formData, 'roundId');
  const gameId = str(formData, 'gameId');

  await serviceClient()
    .from('rounds')
    .update({
      difficulty: Math.min(5, Math.max(1, num(formData, 'difficulty', 3))),
      round_type: (str(formData, 'roundType') || 'mixed') as RoundType,
      fake_rationale: str(formData, 'fakeRationale'),
      decoy_rationale: str(formData, 'decoyRationale'),
      editor_notes: str(formData, 'editorNotes') || null,
    })
    .eq('id', roundId);

  // Option words + definitions.
  const { data: optionRows } = await serviceClient()
    .from('round_options')
    .select('id, position, is_real')
    .eq('round_id', roundId)
    .order('position');

  const options = (optionRows ?? []) as Array<{ id: string; position: number; is_real: boolean }>;
  const fakeChoice = str(formData, 'fakeOptionId');
  const decoyChoice = str(formData, 'decoyOptionId');

  for (const option of options) {
    const word = str(formData, `word_${option.id}`);
    const isReal = option.id !== fakeChoice;
    const patch: Record<string, unknown> = {
      is_real: isReal,
      part_of_speech: isReal ? str(formData, `pos_${option.id}`) || null : null,
      short_definition: isReal ? str(formData, `short_${option.id}`) || null : null,
      expanded_definition: isReal ? str(formData, `expanded_${option.id}`) || null : null,
    };
    if (word) {
      patch.display_word = word.toUpperCase();
      patch.normalized_word = normalizeWord(word);
    }
    await serviceClient().from('round_options').update(patch).eq('id', option.id);
  }

  await serviceClient()
    .from('rounds')
    .update({
      fake_option_id: fakeChoice || null,
      intended_decoy_option_id: decoyChoice || null,
      // Editing content withdraws the previous approval.
      approved: false,
    })
    .eq('id', roundId);

  await logAdminAction(adminId, 'round.save', 'round', roundId, {});
  revalidatePath(`/admin/games/${gameId}`);
}

export async function moveRoundAction(formData: FormData) {
  await guard();
  const gameId = str(formData, 'gameId');
  const roundId = str(formData, 'roundId');
  const direction = str(formData, 'direction') === 'up' ? -1 : 1;

  const db = serviceClient();
  const { data } = await db
    .from('rounds')
    .select('id, position')
    .eq('game_id', gameId)
    .order('position');
  const rounds = (data ?? []) as Array<{ id: string; position: number }>;
  const index = rounds.findIndex((r) => r.id === roundId);
  const swapWith = rounds[index + direction];
  if (index === -1 || !swapWith) return;

  const current = rounds[index];
  // Park one row outside the range to satisfy the unique (game_id, position).
  await db.from('rounds').update({ position: 99 }).eq('id', current.id);
  await db.from('rounds').update({ position: current.position }).eq('id', swapWith.id);
  await db.from('rounds').update({ position: swapWith.position }).eq('id', current.id);

  revalidatePath(`/admin/games/${gameId}`);
}

export async function deleteGameAction(formData: FormData) {
  const adminId = await guard();
  const gameId = str(formData, 'gameId');
  const game = await getGameWithRounds(gameId);
  if (!game) return;
  if (game.status === 'published') throw new Error('Unpublish before deleting.');
  await serviceClient().from('games').delete().eq('id', gameId);
  await logAdminAction(adminId, 'game.delete', 'game', gameId, { date: game.active_date });
  redirect('/admin/games');
}

/* -------------------------------------------------------------------------- */
/* Generation + import                                                         */
/* -------------------------------------------------------------------------- */

export async function generatePromptAction(formData: FormData) {
  const adminId = await guard();
  const days = Math.min(60, Math.max(1, num(formData, 'days', 20)));

  const runway = await getRunway();
  const startDate = str(formData, 'startDate') || runway.nextUnusedDate;
  const startGameNumber = await getNextGameNumber();
  const history = await getHistoryContext();

  const prompt = buildGenerationPrompt({ days, startDate, startGameNumber, history });

  const { data } = await serviceClient()
    .from('game_generation_batches')
    .insert({
      start_date: startDate,
      days_requested: days,
      prompt,
      status: 'prompt_generated',
      created_by: adminId,
    })
    .select('id')
    .single();

  const batchId = (data as { id: string } | null)?.id;
  await logAdminAction(adminId, 'bank.prompt', 'batch', batchId ?? null, { days, startDate });
  redirect(`/admin/games/generate${batchId ? `?batch=${batchId}` : ''}`);
}

export type ImportReport = {
  ok: boolean;
  message: string;
  summary?: ReturnType<typeof summarizeBank>;
  parseIssues?: string[];
  games?: Array<{
    date: string;
    gameNumber: number;
    errors: string[];
    warnings: string[];
  }>;
};

export async function importBankAction(formData: FormData) {
  const adminId = await guard();
  const json = String(formData.get('json') ?? '');
  const batchId = str(formData, 'batchId') || null;

  const parsed = parseBankText(json);
  if (!parsed.ok) {
    const report: ImportReport = {
      ok: false,
      message: parsed.message,
      parseIssues: parsed.issues,
    };
    await storeBatchReport(batchId, report, 'rejected', json);
    redirect(`/admin/games/generate?batch=${batchId ?? ''}&status=rejected`);
  }

  const history = await getHistoryContext();
  const { reports } = validateBank(parsed.games, history);

  const report: ImportReport = {
    ok: reports.every((r) => r.report.ok),
    message: reports.every((r) => r.report.ok)
      ? 'Imported as needs_review. Nothing is published.'
      : 'Imported with validation errors. Fix them before publishing.',
    summary: summarizeBank(parsed.games),
    games: reports.map((entry) => ({
      date: entry.game.activeDate,
      gameNumber: entry.game.gameNumber,
      errors: entry.report.errors.map((i) => i.message),
      warnings: entry.report.warnings.map((i) => i.message),
    })),
  };

  // Imported content always lands as needs_review, never published.
  await saveDraftGames(parsed.games, {
    status: 'needs_review',
    batchId,
    overwrite: formData.get('overwrite') === 'on',
  });

  await storeBatchReport(batchId, report, 'imported', json);
  await logAdminAction(adminId, 'bank.import', 'batch', batchId, {
    games: parsed.games.length,
    ok: report.ok,
  });

  revalidatePath('/admin/games');
  redirect(`/admin/games/generate?batch=${batchId ?? ''}&status=imported`);
}

async function storeBatchReport(
  batchId: string | null,
  report: ImportReport,
  status: 'imported' | 'rejected',
  json: string,
) {
  if (!batchId) return;
  let parsedJson: unknown = null;
  try {
    parsedJson = JSON.parse(json);
  } catch {
    parsedJson = null;
  }
  await serviceClient()
    .from('game_generation_batches')
    .update({ report: report as unknown as Record<string, unknown>, status, imported_json: parsedJson })
    .eq('id', batchId);
}

/* -------------------------------------------------------------------------- */
/* Flags, comparisons, benchmark                                               */
/* -------------------------------------------------------------------------- */

export async function toggleFlagAction(formData: FormData) {
  const adminId = await guard();
  const key = str(formData, 'key');
  const enabled = str(formData, 'enabled') === 'true';
  await setFlag(key, { enabled });
  await logAdminAction(adminId, 'flag.toggle', 'flag', key, { enabled });
  revalidatePath('/admin/flags');
  revalidatePath('/');
}

export async function saveComparisonsAction(formData: FormData) {
  const adminId = await guard();
  const mode = str(formData, 'mode') || 'benchmark';
  const minimum = Math.max(1, num(formData, 'minimumRealSampleSize', 100));

  await setFlag('player_comparisons', {
    enabled: formData.get('comparisonsEnabled') === 'on',
    configuration: { mode, minimum_real_sample_size: minimum },
  });
  await setFlag('benchmark_comparisons', {
    enabled: formData.get('benchmarkEnabled') === 'on',
  });
  await setFlag('public_round_stats', {
    enabled: formData.get('roundStatsEnabled') === 'on',
  });

  await serviceClient()
    .from('app_settings')
    .upsert({ key: 'comparisons', value: { mode, minimum_real_sample_size: minimum } });

  await logAdminAction(adminId, 'comparisons.save', 'settings', 'comparisons', { mode, minimum });
  revalidatePath('/admin/comparisons');
  revalidatePath('/');
}

export async function saveBenchmarkAction(formData: FormData) {
  const adminId = await guard();
  const id = str(formData, 'benchmarkId');
  const populationSize = Math.max(10, num(formData, 'populationSize', 6000));
  const seed = num(formData, 'seed', 20260728);
  const publiclyVisible = formData.get('publiclyVisible') === 'on';

  let distribution: unknown = undefined;
  const raw = String(formData.get('distribution') ?? '').trim();
  if (raw) {
    try {
      distribution = JSON.parse(raw);
    } catch {
      redirect('/admin/comparisons?error=distribution');
    }
  }

  const patch: Record<string, unknown> = {
    population_size: populationSize,
    seed,
    publicly_visible: publiclyVisible,
  };
  if (distribution) patch.distribution = distribution;

  await serviceClient().from('benchmark_versions').update(patch).eq('id', id);
  await logAdminAction(adminId, 'benchmark.save', 'benchmark', id, { populationSize, seed });
  revalidatePath('/admin/comparisons');
}

/* -------------------------------------------------------------------------- */
/* Simulated QA data                                                           */
/* -------------------------------------------------------------------------- */

export async function simulateAction(formData: FormData) {
  const adminId = await guard();
  const gameId = str(formData, 'gameId');
  const count = Math.min(6000, Math.max(1, num(formData, 'count', 100)));
  const outcome = await generateSimulatedAttempts(gameId, count);
  await logAdminAction(adminId, 'simulate.generate', 'game', gameId, outcome);
  revalidatePath('/admin/comparisons');
  revalidatePath('/admin/dummy-players');
  revalidatePath('/admin');
  revalidatePath('/leaderboard');
}

export async function deleteSimulatedAction(formData: FormData) {
  const adminId = await guard();
  const gameId = str(formData, 'gameId') || null;
  const removed = await deleteSimulatedAttempts(gameId);
  await logAdminAction(adminId, 'simulate.delete', 'game', gameId, { removed });
  revalidatePath('/admin/comparisons');
  revalidatePath('/admin/dummy-players');
  revalidatePath('/admin');
  revalidatePath('/leaderboard');
}

/**
 * Generate dummy players for ALL published games at once.
 * Tops each game up to `count` simulated attempts rather than adding blindly.
 */
export async function generateAllSimulatedAction(formData: FormData) {
  const adminId = await guard();
  const perGame = Math.min(1000, Math.max(100, num(formData, 'count', 300)));

  const { data: games } = await serviceClient()
    .from('games')
    .select('id')
    .eq('status', 'published');

  if (!games?.length) return;

  let totalAdded = 0;
  for (const game of (games as Array<{ id: string }>)) {
    const existing = await countSimulatedAttempts(game.id);
    const needed = Math.max(0, perGame - existing);
    if (needed > 0) {
      const result = await generateSimulatedAttempts(game.id, needed);
      totalAdded += result.attempts;
    }
  }

  await logAdminAction(adminId, 'simulate.generate_all', 'game', null, { totalAdded, perGame });
  revalidatePath('/admin/dummy-players');
  revalidatePath('/admin');
  revalidatePath('/leaderboard');
}

/* -------------------------------------------------------------------------- */
/* Players + attempts                                                          */
/* -------------------------------------------------------------------------- */

export async function setAttemptIntegrityAction(formData: FormData) {
  const adminId = await guard();
  const attemptId = str(formData, 'attemptId');
  const status = str(formData, 'integrityStatus');
  const ranked = str(formData, 'isRanked');

  const patch: Record<string, unknown> = { integrity_status: status };
  if (ranked) patch.is_ranked = ranked === 'true';

  await serviceClient().from('attempts').update(patch).eq('id', attemptId);
  await logAdminAction(adminId, 'attempt.integrity', 'attempt', attemptId, { status, ranked });
  revalidatePath('/admin/attempts');
  revalidatePath('/leaderboard');
}

export async function updatePlayerAction(formData: FormData) {
  const adminId = await guard();
  const userId = str(formData, 'userId');
  const patch: Record<string, unknown> = {};

  const displayName = str(formData, 'displayName');
  if (displayName) patch.display_name = displayName;
  if (formData.get('bannedName') !== null) {
    patch.is_banned_name = formData.get('bannedName') === 'on';
  }
  if (formData.get('leaderboardOptIn') !== null) {
    patch.leaderboard_opt_in = formData.get('leaderboardOptIn') === 'on';
  }

  if (Object.keys(patch).length) {
    await serviceClient().from('profiles').update(patch).eq('user_id', userId);
    await logAdminAction(adminId, 'player.update', 'profile', userId, patch);
  }
  revalidatePath('/admin/players');
}

/* -------------------------------------------------------------------------- */
/* Lexicon                                                                     */
/* -------------------------------------------------------------------------- */

export async function updateLexiconAction(formData: FormData) {
  const adminId = await guard();
  const id = str(formData, 'id');
  await updateLexiconEntry(id, {
    short_definition: str(formData, 'shortDefinition') || null,
    expanded_definition: str(formData, 'expandedDefinition') || null,
    part_of_speech: str(formData, 'partOfSpeech') || null,
    difficulty: Math.min(5, Math.max(1, num(formData, 'difficulty', 3))),
    accepted_for_game: formData.get('accepted') === 'on',
    editorial_notes: str(formData, 'editorialNotes') || null,
  });
  await logAdminAction(adminId, 'lexicon.update', 'lexicon', id, {});
  revalidatePath('/admin/lexicon');
}

/* -------------------------------------------------------------------------- */
/* Publishers (embeddable widget)                                              */
/* -------------------------------------------------------------------------- */

export async function createPublisherAction(formData: FormData) {
  const adminId = await guard();
  const name = str(formData, 'name');
  if (!name) throw new Error('Name is required.');

  const originsRaw = str(formData, 'allowedOrigins');
  const allowedOrigins = originsRaw
    .split(/[\n,]/)
    .map((line) => normalizeOrigin(line))
    .filter((value): value is string => value !== null);

  const key = generatePublisherKey();

  const { data, error } = await serviceClient()
    .from('publishers')
    .insert({
      key,
      name,
      contact_email: str(formData, 'contactEmail') || null,
      allowed_origins: allowedOrigins,
      active: true,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error('Could not create publisher.');

  await logAdminAction(adminId, 'publisher.create', 'publisher', (data as { id: string }).id, {
    name,
    allowedOrigins,
  });
  revalidatePath('/admin/publishers');
}

export async function updatePublisherAction(formData: FormData) {
  const adminId = await guard();
  const id = str(formData, 'id');
  if (!id) throw new Error('Missing publisher id.');

  const originsRaw = str(formData, 'allowedOrigins');
  const allowedOrigins = originsRaw
    .split(/[\n,]/)
    .map((line) => normalizeOrigin(line))
    .filter((value): value is string => value !== null);

  const patch: Record<string, unknown> = {
    name: str(formData, 'name'),
    contact_email: str(formData, 'contactEmail') || null,
    allowed_origins: allowedOrigins,
    active: formData.get('active') === 'on',
    ads_enabled: formData.get('adsEnabled') === 'on',
    notes: str(formData, 'notes') || null,
  };

  await serviceClient().from('publishers').update(patch).eq('id', id);
  await logAdminAction(adminId, 'publisher.update', 'publisher', id, patch);
  revalidatePath('/admin/publishers');
}

export async function runAttributionCheckAction(formData: FormData) {
  const adminId = await guard();
  const id = str(formData, 'id');
  if (!id) throw new Error('Missing publisher id.');
  const result = await checkAttributionForPublisher(id);
  await logAdminAction(adminId, 'publisher.attribution_check', 'publisher', id, result);
  revalidatePath('/admin/publishers');
}


