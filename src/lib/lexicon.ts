// Server/CLI only: also used by scripts/seed.ts.
import { serviceClient } from './supabase/admin';
import { normalizeWord, type DraftGame } from './content/draft';
import type { HistoryContext } from './validation';

export type LexiconEntry = {
  id: string;
  word: string;
  normalized_word: string;
  part_of_speech: string | null;
  short_definition: string | null;
  expanded_definition: string | null;
  example_usage: string | null;
  difficulty: number;
  frequency_band: number;
  accepted_for_game: boolean;
  editorial_notes: string | null;
  source_notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

/**
 * Every word the game will ever accept lives here, pre-ingested. Gameplay never
 * calls a dictionary API: definitions shown in results come from these rows.
 */
export async function listLexicon(options: {
  search?: string;
  accepted?: boolean | null;
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: LexiconEntry[]; count: number }> {
  let query = serviceClient()
    .from('lexicon_entries')
    .select('*', { count: 'exact' })
    .order('word', { ascending: true })
    .range(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 100) - 1);

  if (options.search) {
    query = query.ilike('word', `${options.search.trim()}%`);
  }
  if (options.accepted === true) query = query.eq('accepted_for_game', true);
  if (options.accepted === false) query = query.eq('accepted_for_game', false);

  const { data, count } = await query;
  return { rows: (data ?? []) as unknown as LexiconEntry[], count: count ?? 0 };
}

export async function getAcceptedLexiconSets(): Promise<{
  accepted: Set<string>;
  rejected: Set<string>;
}> {
  const accepted = new Set<string>();
  const rejected = new Set<string>();
  const pageSize = 1000;

  for (let page = 0; page < 60; page += 1) {
    const { data } = await serviceClient()
      .from('lexicon_entries')
      .select('normalized_word, accepted_for_game')
      .range(page * pageSize, page * pageSize + pageSize - 1);
    const rows = (data ?? []) as Array<{ normalized_word: string; accepted_for_game: boolean }>;
    for (const row of rows) {
      if (row.accepted_for_game) accepted.add(row.normalized_word);
      else rejected.add(row.normalized_word);
    }
    if (rows.length < pageSize) break;
  }

  return { accepted, rejected };
}

export type UsageRow = {
  normalized_word: string;
  display_word: string;
  is_real: boolean;
  was_fake: boolean;
  was_decoy: boolean;
  active_date: string;
  game_number: number;
};

export async function getUsageHistory(): Promise<UsageRow[]> {
  const { data } = await serviceClient()
    .from('word_usage_history')
    .select('normalized_word, display_word, is_real, was_fake, was_decoy, active_date, game_number')
    .order('active_date', { ascending: false })
    .limit(20000);
  return (data ?? []) as unknown as UsageRow[];
}

/** Everything the validator and the prompt builder need about the past. */
export async function getHistoryContext(): Promise<HistoryContext> {
  const [{ accepted, rejected }, usage] = await Promise.all([
    getAcceptedLexiconSets(),
    getUsageHistory(),
  ]);

  const usedFakeWords = new Set<string>();
  const recentRealWords = new Map<string, string>();
  const recentDecoys = new Map<string, string>();

  for (const row of usage) {
    if (row.was_fake || !row.is_real) usedFakeWords.add(row.normalized_word);
    if (row.is_real) {
      const prior = recentRealWords.get(row.normalized_word);
      if (!prior || prior < row.active_date) recentRealWords.set(row.normalized_word, row.active_date);
    }
    if (row.was_decoy) {
      const prior = recentDecoys.get(row.normalized_word);
      if (!prior || prior < row.active_date) recentDecoys.set(row.normalized_word, row.active_date);
    }
  }

  return { usedFakeWords, recentRealWords, recentDecoys, acceptedLexicon: accepted, rejectedLexicon: rejected };
}

/**
 * Excluding the game being edited/imported itself, so re-validating a saved
 * game does not report it as a duplicate of itself.
 */
export function historyWithout(history: HistoryContext, games: DraftGame[]): HistoryContext {
  const fakes = new Set(history.usedFakeWords);
  const reals = new Map(history.recentRealWords);
  const decoys = new Map(history.recentDecoys);
  const accepted = new Set(history.acceptedLexicon);

  for (const game of games) {
    for (const round of game.rounds ?? []) {
      const fake = normalizeWord(round.fakeWord ?? '');
      if (fake) fakes.delete(fake);
      const decoy = normalizeWord(round.decoyWord ?? '');
      if (decoy && decoys.get(decoy) === game.activeDate) decoys.delete(decoy);
      for (const option of round.options ?? []) {
        const norm = normalizeWord(option.word);
        if (!option.isReal) {
          fakes.delete(norm);
          accepted.delete(norm);
        }
        if (reals.get(norm) === game.activeDate) reals.delete(norm);
      }
    }
  }

  return {
    usedFakeWords: fakes,
    recentRealWords: reals,
    recentDecoys: decoys,
    acceptedLexicon: accepted,
    rejectedLexicon: history.rejectedLexicon,
  };
}

export type LexiconUpsert = {
  word: string;
  partOfSpeech?: string | null;
  shortDefinition?: string | null;
  expandedDefinition?: string | null;
  difficulty?: number;
  frequencyBand?: number;
  acceptedForGame?: boolean;
  editorialNotes?: string | null;
  sourceNotes?: string | null;
  tags?: string[];
};

/** Ingest words into the curated lexicon. Existing rows keep their definitions
 *  unless the incoming row provides better data. */
export async function upsertLexicon(entries: LexiconUpsert[]): Promise<Map<string, string>> {
  const byNorm = new Map<string, LexiconUpsert>();
  for (const entry of entries) {
    const norm = normalizeWord(entry.word);
    if (!norm) continue;
    const existing = byNorm.get(norm);
    if (!existing || (!existing.shortDefinition && entry.shortDefinition)) {
      byNorm.set(norm, entry);
    }
  }
  if (!byNorm.size) return new Map();

  const payload = Array.from(byNorm.entries()).map(([norm, entry]) => ({
    word: entry.word.trim().toUpperCase(),
    normalized_word: norm,
    part_of_speech: entry.partOfSpeech ?? null,
    short_definition: entry.shortDefinition ?? null,
    expanded_definition: entry.expandedDefinition ?? null,
    difficulty: entry.difficulty ?? 3,
    frequency_band: entry.frequencyBand ?? 3,
    accepted_for_game: entry.acceptedForGame ?? true,
    editorial_notes: entry.editorialNotes ?? null,
    source_notes: entry.sourceNotes ?? 'Perkul curated lexicon',
    tags: entry.tags ?? [],
  }));

  const idByNorm = new Map<string, string>();
  const chunkSize = 500;

  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { data, error } = await serviceClient()
      .from('lexicon_entries')
      .upsert(chunk, { onConflict: 'normalized_word' })
      .select('id, normalized_word');
    if (error) throw new Error(`Lexicon upsert failed: ${error.message}`);
    for (const row of (data ?? []) as Array<{ id: string; normalized_word: string }>) {
      idByNorm.set(row.normalized_word, row.id);
    }
  }

  return idByNorm;
}

export async function updateLexiconEntry(
  id: string,
  patch: Partial<{
    word: string;
    part_of_speech: string | null;
    short_definition: string | null;
    expanded_definition: string | null;
    difficulty: number;
    frequency_band: number;
    accepted_for_game: boolean;
    editorial_notes: string | null;
  }>,
): Promise<void> {
  const payload: Record<string, unknown> = { ...patch };
  if (patch.word) {
    payload.word = patch.word.trim().toUpperCase();
    payload.normalized_word = normalizeWord(patch.word);
  }
  await serviceClient().from('lexicon_entries').update(payload).eq('id', id);
}
