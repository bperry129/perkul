/**
 * Content validator.
 *
 * Nothing reaches "ready" or "published" without passing this. Hard failures
 * block publication; warnings are editorial judgement calls surfaced in the
 * admin UI. Trust in the word list is the product, so this file is deliberately
 * pedantic.
 */
import { PATTERN_ROUND_TYPES, ROUND_TYPES } from './types';
import { normalizeWord, type DraftGame, type DraftRound } from './content/draft';

export type Issue = {
  level: 'error' | 'warning';
  scope: 'game' | 'round';
  round?: number;
  code: string;
  message: string;
};

export type HistoryContext = {
  /** every fake word ever published (normalized) */
  usedFakeWords: Set<string>;
  /** normalized real word -> most recent date used */
  recentRealWords: Map<string, string>;
  /** normalized decoy -> most recent date used */
  recentDecoys: Map<string, string>;
  /** normalized words accepted as real in the curated lexicon */
  acceptedLexicon: Set<string>;
  /** words present in the lexicon but explicitly not accepted for play */
  rejectedLexicon?: Set<string>;
};

export const EMPTY_HISTORY: HistoryContext = {
  usedFakeWords: new Set(),
  recentRealWords: new Map(),
  recentDecoys: new Map(),
  acceptedLexicon: new Set(),
  rejectedLexicon: new Set(),
};

export const REUSE_COOLDOWN_DAYS = {
  realWord: 60,
  decoy: 180,
} as const;

/**
 * Words that must never appear as a fabricated option: common proper nouns,
 * surnames, brands and standard abbreviations that a player would reasonably
 * consider "a word they've seen".
 */
export const FAKE_COLLISION_WATCHLIST = new Set(
  [
    'aspen', 'austin', 'avery', 'boden', 'bowen', 'braden', 'brenton', 'bryn',
    'camden', 'carson', 'colby', 'corbin', 'dalton', 'darden', 'dayton',
    'delta', 'denton', 'devon', 'easton', 'elden', 'ember', 'emerson',
    'gannon', 'garrick', 'gilden', 'golden', 'hadley', 'halden', 'harlow',
    'haven', 'holden', 'hudson', 'kelvin', 'kendall', 'landen', 'linden',
    'logan', 'lorne', 'malden', 'marden', 'mercer', 'merlin', 'morgan',
    'nolan', 'norden', 'oakley', 'olsen', 'orrin', 'paxton', 'peyton',
    'quinton', 'raven', 'rowan', 'selden', 'shelby', 'sloane', 'sutton',
    'tarden', 'thane', 'tilden', 'torrance', 'travis', 'trenton', 'vance',
    'walden', 'warden', 'weston', 'wilder', 'winston',
    // brands / marks
    'aveeno', 'brita', 'clorox', 'dasani', 'dyson', 'fanta', 'glade', 'kleenex',
    'lysol', 'nivea', 'nokia', 'novartis', 'purell', 'revlon', 'sanka',
    'sonos', 'sprite', 'swiffer', 'tesla', 'venmo', 'zappos', 'zillow',
  ].map((w) => w.toLowerCase()),
);

const SUFFIX_INFLECTIONS = ['s', 'es', 'ed', 'ing', 'er', 'est', 'ly'];

function daysBetween(a: string, b: string): number {
  const at = Date.parse(`${a}T12:00:00Z`);
  const bt = Date.parse(`${b}T12:00:00Z`);
  return Math.round(Math.abs(bt - at) / 86_400_000);
}

function pushIssue(list: Issue[], issue: Issue) {
  list.push(issue);
}

export function validateRound(
  round: DraftRound,
  game: DraftGame,
  history: HistoryContext,
  issues: Issue[] = [],
): Issue[] {
  const at = (level: Issue['level'], code: string, message: string) =>
    pushIssue(issues, { level, scope: 'round', round: round.position, code, message });

  const options = round.options ?? [];

  if (options.length !== 5) {
    at('error', 'option_count', `Round ${round.position} has ${options.length} options, expected 5.`);
  }

  const fakes = options.filter((o) => !o.isReal);
  const reals = options.filter((o) => o.isReal);

  if (fakes.length !== 1) {
    at('error', 'fake_count', `Round ${round.position} has ${fakes.length} fabricated words, expected exactly 1.`);
  }
  if (reals.length !== 4) {
    at('error', 'real_count', `Round ${round.position} has ${reals.length} real words, expected exactly 4.`);
  }

  const fakeNorm = normalizeWord(round.fakeWord ?? '');
  const decoyNorm = normalizeWord(round.decoyWord ?? '');

  if (!fakeNorm) {
    at('error', 'fake_missing', `Round ${round.position} does not name its fabricated word.`);
  } else if (!fakes.some((o) => normalizeWord(o.word) === fakeNorm)) {
    at('error', 'fake_mismatch', `Round ${round.position}: "${round.fakeWord}" is not the option flagged as fabricated.`);
  }

  if (!decoyNorm) {
    at('error', 'decoy_missing', `Round ${round.position} has no intended decoy.`);
  } else if (!reals.some((o) => normalizeWord(o.word) === decoyNorm)) {
    at('error', 'decoy_not_real', `Round ${round.position}: the intended decoy "${round.decoyWord}" must be one of the real words.`);
  }

  // Answer-key integrity against the curated lexicon.
  if (fakeNorm && history.acceptedLexicon.has(fakeNorm)) {
    at('error', 'fake_is_real', `Round ${round.position}: "${round.fakeWord}" exists in the accepted lexicon and cannot be used as a fake.`);
  }
  if (fakeNorm && history.usedFakeWords.has(fakeNorm)) {
    at('error', 'fake_reused', `Round ${round.position}: "${round.fakeWord}" has already been used as a fake. Fakes are never reused.`);
  }
  if (fakeNorm && FAKE_COLLISION_WATCHLIST.has(fakeNorm)) {
    at('warning', 'fake_watchlist', `Round ${round.position}: "${round.fakeWord}" reads as a common proper noun, surname or brand.`);
  }
  if (fakeNorm) {
    for (const suffix of SUFFIX_INFLECTIONS) {
      if (fakeNorm.endsWith(suffix)) {
        const stem = fakeNorm.slice(0, -suffix.length);
        if (stem.length >= 3 && history.acceptedLexicon.has(stem)) {
          at('warning', 'fake_inflection', `Round ${round.position}: "${round.fakeWord}" looks like an accepted inflection of "${stem.toUpperCase()}".`);
        }
      }
    }
    if (fakeNorm.length < 4) {
      at('warning', 'fake_short', `Round ${round.position}: "${round.fakeWord}" is very short for a convincing fabrication.`);
    }
    if (!/[aeiouy]/.test(fakeNorm)) {
      at('error', 'fake_implausible', `Round ${round.position}: "${round.fakeWord}" has no vowel and cannot read as English.`);
    }
  }

  for (const option of options) {
    const norm = normalizeWord(option.word);
    if (!norm) {
      at('error', 'empty_word', `Round ${round.position} contains an empty option.`);
      continue;
    }
    if (/[^a-z]/.test(norm) || /[^A-Za-z]/.test(option.word.trim())) {
      at('error', 'bad_characters', `Round ${round.position}: "${option.word}" must be a single alphabetic word (no spaces, digits, hyphens or periods).`);
    }
    if (option.isReal) {
      if (!option.shortDefinition || option.shortDefinition.trim().length < 3) {
        at('error', 'missing_definition', `Round ${round.position}: "${option.word}" has no short definition.`);
      }
      if (!option.partOfSpeech) {
        at('warning', 'missing_pos', `Round ${round.position}: "${option.word}" has no part of speech.`);
      }
      if (history.rejectedLexicon?.has(norm)) {
        at('error', 'word_rejected', `Round ${round.position}: "${option.word}" is marked not accepted for play in the lexicon.`);
      }
      if (norm.length <= 2) {
        at('error', 'word_too_short', `Round ${round.position}: "${option.word}" is too short to be a fair option.`);
      }
      const lastUsed = history.recentRealWords.get(norm);
      if (lastUsed && daysBetween(lastUsed, game.activeDate) < REUSE_COOLDOWN_DAYS.realWord) {
        at('warning', 'real_reuse', `Round ${round.position}: "${option.word}" was used on ${lastUsed} (inside the ${REUSE_COOLDOWN_DAYS.realWord}-day cooldown).`);
      }
    }
  }

  if (decoyNorm) {
    const lastDecoy = history.recentDecoys.get(decoyNorm);
    if (lastDecoy && daysBetween(lastDecoy, game.activeDate) < REUSE_COOLDOWN_DAYS.decoy) {
      at('warning', 'decoy_reuse', `Round ${round.position}: "${round.decoyWord}" was an intended decoy on ${lastDecoy} (inside the ${REUSE_COOLDOWN_DAYS.decoy}-day cooldown).`);
    }
  }

  // Fairness: enough anchors that this is not five obscure words.
  const anchors = reals.filter((o) => normalizeWord(o.word) !== decoyNorm);
  if (anchors.length < 3 && reals.length === 4) {
    at('warning', 'anchor_count', `Round ${round.position} may not have three recognisable anchor words.`);
  }

  if (!round.fakeRationale || round.fakeRationale.trim().length < 20) {
    at('error', 'fake_rationale', `Round ${round.position} needs an explanation of why the fake is plausible.`);
  }
  if (!round.decoyRationale || round.decoyRationale.trim().length < 20) {
    at('error', 'decoy_rationale', `Round ${round.position} needs an explanation of why the decoy looks suspicious.`);
  }
  if (!round.difficulty || round.difficulty < 1 || round.difficulty > 5) {
    at('error', 'difficulty', `Round ${round.position} needs a difficulty from 1 to 5.`);
  }
  if (!round.roundType || !ROUND_TYPES.includes(round.roundType)) {
    at('error', 'round_type', `Round ${round.position} has an unknown round type "${round.roundType}".`);
  }

  const seen = new Set<string>();
  for (const option of options) {
    const norm = normalizeWord(option.word);
    if (seen.has(norm)) {
      at('error', 'duplicate_in_round', `Round ${round.position} repeats "${option.word}".`);
    }
    seen.add(norm);
  }

  return issues;
}

export type ValidationReport = {
  errors: Issue[];
  warnings: Issue[];
  ok: boolean;
};

export function validateGame(
  game: DraftGame,
  history: HistoryContext = EMPTY_HISTORY,
): ValidationReport {
  const issues: Issue[] = [];
  const at = (level: Issue['level'], code: string, message: string) =>
    pushIssue(issues, { level, scope: 'game', code, message });

  const rounds = (game.rounds ?? []).slice().sort((a, b) => a.position - b.position);

  if (rounds.length !== 10) {
    at('error', 'round_count', `Game ${game.gameNumber} has ${rounds.length} rounds, expected exactly 10.`);
  }

  const positions = rounds.map((r) => r.position);
  const expected = Array.from({ length: rounds.length }, (_, i) => i + 1);
  if (positions.join(',') !== expected.join(',')) {
    at('error', 'round_positions', 'Round positions must run 1 through 10 with no gaps or duplicates.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(game.activeDate)) {
    at('error', 'active_date', `"${game.activeDate}" is not a valid YYYY-MM-DD active date.`);
  }
  if (!Number.isInteger(game.gameNumber) || game.gameNumber < 1) {
    at('error', 'game_number', 'Game number must be a positive integer.');
  }

  // Difficulty should broadly rise across the day.
  const early = rounds.filter((r) => r.position <= 3).map((r) => r.difficulty);
  const late = rounds.filter((r) => r.position >= 8).map((r) => r.difficulty);
  if (early.length && late.length) {
    const avgEarly = early.reduce((a, b) => a + b, 0) / early.length;
    const avgLate = late.reduce((a, b) => a + b, 0) / late.length;
    if (avgLate <= avgEarly) {
      at('warning', 'difficulty_curve', 'Difficulty does not broadly increase from the opening rounds to the closing rounds.');
    }
  }

  const patternRounds = rounds.filter((r) => PATTERN_ROUND_TYPES.includes(r.roundType));
  if (patternRounds.length > 1) {
    at(
      patternRounds.length > 2 ? 'error' : 'warning',
      'pattern_limit',
      `${patternRounds.length} strongly patterned rounds (${patternRounds
        .map((r) => r.position)
        .join(', ')}). Aim for at most one per game.`,
    );
  }

  // Duplicate words anywhere in the game.
  const wordRounds = new Map<string, number[]>();
  for (const round of rounds) {
    for (const option of round.options ?? []) {
      const norm = normalizeWord(option.word);
      if (!norm) continue;
      wordRounds.set(norm, [...(wordRounds.get(norm) ?? []), round.position]);
    }
  }
  for (const [word, list] of wordRounds) {
    if (list.length > 1) {
      at('error', 'duplicate_in_game', `"${word.toUpperCase()}" appears in rounds ${list.join(' and ')} of the same game.`);
    }
  }

  // Duplicate fakes inside the batch itself.
  const fakeCounts = new Map<string, number[]>();
  for (const round of rounds) {
    const norm = normalizeWord(round.fakeWord ?? '');
    if (!norm) continue;
    fakeCounts.set(norm, [...(fakeCounts.get(norm) ?? []), round.position]);
  }
  for (const [word, list] of fakeCounts) {
    if (list.length > 1) {
      at('error', 'duplicate_fake_in_game', `Fake "${word.toUpperCase()}" is used twice (rounds ${list.join(', ')}).`);
    }
  }

  for (const round of rounds) validateRound(round, game, history, issues);

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  return { errors, warnings, ok: errors.length === 0 };
}

export function validateBank(
  games: DraftGame[],
  history: HistoryContext = EMPTY_HISTORY,
): { reports: Array<{ game: DraftGame; report: ValidationReport }>; ok: boolean } {
  // Accumulate within the batch so a fake reused on day 3 and day 11 is caught.
  const running: HistoryContext = {
    usedFakeWords: new Set(history.usedFakeWords),
    recentRealWords: new Map(history.recentRealWords),
    recentDecoys: new Map(history.recentDecoys),
    acceptedLexicon: new Set(history.acceptedLexicon),
    rejectedLexicon: new Set(history.rejectedLexicon ?? []),
  };

  const seenDates = new Set<string>();
  const seenNumbers = new Set<number>();
  const reports: Array<{ game: DraftGame; report: ValidationReport }> = [];

  for (const game of games.slice().sort((a, b) => a.activeDate.localeCompare(b.activeDate))) {
    const report = validateGame(game, running);

    if (seenDates.has(game.activeDate)) {
      report.errors.push({
        level: 'error',
        scope: 'game',
        code: 'duplicate_date',
        message: `More than one game targets ${game.activeDate}.`,
      });
    }
    if (seenNumbers.has(game.gameNumber)) {
      report.errors.push({
        level: 'error',
        scope: 'game',
        code: 'duplicate_number',
        message: `Game number ${game.gameNumber} is used twice in this batch.`,
      });
    }
    seenDates.add(game.activeDate);
    seenNumbers.add(game.gameNumber);

    report.ok = report.errors.length === 0;
    reports.push({ game, report });

    for (const round of game.rounds ?? []) {
      const fake = normalizeWord(round.fakeWord ?? '');
      if (fake) running.usedFakeWords.add(fake);
      const decoy = normalizeWord(round.decoyWord ?? '');
      if (decoy) running.recentDecoys.set(decoy, game.activeDate);
      for (const option of round.options ?? []) {
        if (!option.isReal) continue;
        const norm = normalizeWord(option.word);
        running.recentRealWords.set(norm, game.activeDate);
        running.acceptedLexicon.add(norm);
      }
    }
  }

  return { reports, ok: reports.every((r) => r.report.ok) };
}

export function summarizeBank(games: DraftGame[]) {
  const rounds = games.flatMap((g) => g.rounds ?? []);
  const options = rounds.flatMap((r) => r.options ?? []);
  const realWords = new Set(
    options.filter((o) => o.isReal).map((o) => normalizeWord(o.word)),
  );
  const fakes = new Set(rounds.map((r) => normalizeWord(r.fakeWord ?? '')).filter(Boolean));
  return {
    games: games.length,
    rounds: rounds.length,
    options: options.length,
    uniqueRealWords: realWords.size,
    fakes: fakes.size,
    dates: games.map((g) => g.activeDate).sort(),
  };
}
