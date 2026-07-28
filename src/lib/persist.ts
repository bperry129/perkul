// Server/CLI only: also used by scripts/seed.ts.
import { serviceClient } from './supabase/admin';
import { upsertLexicon, type LexiconUpsert } from './lexicon';
import { normalizeWord, type DraftGame } from './content/draft';
import type { GameRecord, GameStatus } from './types';

/**
 * Writes an editorial bank to the database.
 *
 * Real words are ingested into the curated lexicon first, then rounds and
 * options are written, then each round is pointed at its fake and decoy option
 * ids. Fabricated words never get a lexicon entry — that is what keeps the
 * "is this word accepted?" question answerable in one query.
 */
export type SaveOptions = {
  status?: GameStatus;
  batchId?: string | null;
  /** replace an existing game on the same date */
  overwrite?: boolean;
  approveRounds?: boolean;
};

export type SaveOutcome = {
  created: number;
  replaced: number;
  skipped: Array<{ activeDate: string; reason: string }>;
  gameIds: string[];
  lexiconWords: number;
};

function lexiconEntriesFor(games: DraftGame[]): LexiconUpsert[] {
  const entries: LexiconUpsert[] = [];
  for (const game of games) {
    for (const round of game.rounds ?? []) {
      for (const option of round.options ?? []) {
        if (!option.isReal) continue;
        entries.push({
          word: option.word,
          partOfSpeech: option.partOfSpeech ?? null,
          shortDefinition: option.shortDefinition ?? null,
          expandedDefinition: option.expandedDefinition ?? null,
          difficulty: round.difficulty,
          frequencyBand: Math.min(5, Math.max(1, round.difficulty)),
          acceptedForGame: true,
          tags: normalizeWord(option.word) === normalizeWord(round.decoyWord) ? ['decoy'] : [],
        });
      }
    }
  }
  return entries;
}

export async function saveDraftGames(
  games: DraftGame[],
  options: SaveOptions = {},
): Promise<SaveOutcome> {
  const db = serviceClient();
  const status = options.status ?? 'needs_review';
  const outcome: SaveOutcome = {
    created: 0,
    replaced: 0,
    skipped: [],
    gameIds: [],
    lexiconWords: 0,
  };

  const lexiconIds = await upsertLexicon(lexiconEntriesFor(games));
  outcome.lexiconWords = lexiconIds.size;

  for (const game of games) {
    const { data: existing } = await db
      .from('games')
      .select('id, status, active_date')
      .eq('active_date', game.activeDate)
      .maybeSingle();

    let gameId: string;

    if (existing) {
      if (!options.overwrite) {
        outcome.skipped.push({
          activeDate: game.activeDate,
          reason: `A game already exists for ${game.activeDate}.`,
        });
        continue;
      }
      gameId = (existing as { id: string }).id;
      await db.from('rounds').delete().eq('game_id', gameId);
      await db
        .from('games')
        .update({
          game_number: game.gameNumber,
          status,
          difficulty_label: game.difficultyLabel ?? null,
          editor_notes: game.editorNotes ?? null,
          source_batch_id: options.batchId ?? null,
          published_at: status === 'published' ? new Date().toISOString() : null,
        })
        .eq('id', gameId);
      outcome.replaced += 1;
    } else {
      const { data: inserted, error } = await db
        .from('games')
        .insert({
          game_number: game.gameNumber,
          active_date: game.activeDate,
          status,
          difficulty_label: game.difficultyLabel ?? null,
          editor_notes: game.editorNotes ?? null,
          source_batch_id: options.batchId ?? null,
          published_at: status === 'published' ? new Date().toISOString() : null,
        })
        .select('id')
        .single();
      if (error || !inserted) {
        outcome.skipped.push({
          activeDate: game.activeDate,
          reason: error?.message ?? 'Insert failed.',
        });
        continue;
      }
      gameId = (inserted as { id: string }).id;
      outcome.created += 1;
    }

    outcome.gameIds.push(gameId);

    for (const round of (game.rounds ?? []).slice().sort((a, b) => a.position - b.position)) {
      const { data: roundRow, error: roundError } = await db
        .from('rounds')
        .insert({
          game_id: gameId,
          position: round.position,
          difficulty: round.difficulty,
          round_type: round.roundType,
          fake_rationale: round.fakeRationale,
          decoy_rationale: round.decoyRationale,
          editor_notes: round.editorNotes ?? null,
          approved: options.approveRounds ?? false,
        })
        .select('id')
        .single();
      if (roundError || !roundRow) continue;
      const roundId = (roundRow as { id: string }).id;

      const optionPayload = (round.options ?? []).map((option, index) => {
        const norm = normalizeWord(option.word);
        return {
          round_id: roundId,
          position: index + 1,
          display_word: option.word.trim().toUpperCase(),
          normalized_word: norm,
          is_real: option.isReal,
          part_of_speech: option.isReal ? option.partOfSpeech ?? null : null,
          short_definition: option.isReal ? option.shortDefinition ?? null : null,
          expanded_definition: option.isReal ? option.expandedDefinition ?? null : null,
          lexicon_entry_id: option.isReal ? lexiconIds.get(norm) ?? null : null,
        };
      });

      const { data: optionRows } = await db
        .from('round_options')
        .insert(optionPayload)
        .select('id, normalized_word, is_real');

      const rows = (optionRows ?? []) as Array<{
        id: string;
        normalized_word: string;
        is_real: boolean;
      }>;

      const fakeNorm = normalizeWord(round.fakeWord);
      const decoyNorm = normalizeWord(round.decoyWord);
      const fakeRow = rows.find((r) => !r.is_real && r.normalized_word === fakeNorm) ??
        rows.find((r) => !r.is_real);
      const decoyRow = rows.find((r) => r.is_real && r.normalized_word === decoyNorm);

      await db
        .from('rounds')
        .update({
          fake_option_id: fakeRow?.id ?? null,
          intended_decoy_option_id: decoyRow?.id ?? null,
        })
        .eq('id', roundId);
    }
  }

  return outcome;
}

/** Turn a stored game back into the editorial draft shape (for re-validation). */
export function gameRecordToDraft(game: GameRecord): DraftGame {
  const rounds = (game.rounds ?? []).slice().sort((a, b) => a.position - b.position);
  return {
    activeDate: game.active_date,
    gameNumber: game.game_number,
    difficultyLabel: game.difficulty_label,
    editorNotes: game.editor_notes,
    rounds: rounds.map((round) => {
      const options = (round.options ?? []).slice().sort((a, b) => a.position - b.position);
      const fake = options.find((o) => o.id === round.fake_option_id);
      const decoy = options.find((o) => o.id === round.intended_decoy_option_id);
      return {
        position: round.position,
        difficulty: round.difficulty,
        roundType: round.round_type,
        fakeWord: fake?.display_word ?? '',
        decoyWord: decoy?.display_word ?? '',
        fakeRationale: round.fake_rationale ?? '',
        decoyRationale: round.decoy_rationale ?? '',
        editorNotes: round.editor_notes,
        options: options.map((option) => ({
          word: option.display_word,
          isReal: option.is_real,
          partOfSpeech: option.part_of_speech,
          shortDefinition: option.short_definition,
          expandedDefinition: option.expanded_definition,
        })),
      };
    }),
  };
}

export async function setGameStatus(gameId: string, status: GameStatus): Promise<void> {
  await serviceClient()
    .from('games')
    .update({
      status,
      published_at: status === 'published' ? new Date().toISOString() : null,
    })
    .eq('id', gameId);
}

export async function logAdminAction(
  adminUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await serviceClient().from('admin_audit_log').insert({
    admin_user_id: adminUserId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}
