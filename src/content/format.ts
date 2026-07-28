/**
 * Compact authoring format for the editorial bank.
 *
 * Each option is written as a single pipe-delimited string:
 *
 *   'BRUME|n|mist or fog, especially in cold weather|Optional expanded gloss.'
 *
 * Prefixes:
 *   *  this option is the fabricated word (exactly one per round)
 *   ^  this option is the intended decoy (a real word built to attract blame)
 *
 * Position in the array is only the canonical storage order — every player sees
 * a per-attempt shuffle, so nothing is leaked by the order here.
 */
import type { DraftGame, DraftOption, DraftRound } from '../lib/content/draft';
import type { RoundType } from '../lib/types';

const POS: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  prep: 'preposition',
  interj: 'interjection',
};

export type RoundSpec = [
  difficulty: number,
  type: RoundType,
  options: string[],
  fakeRationale: string,
  decoyRationale: string,
];

function parseOption(raw: string): { option: DraftOption; isFake: boolean; isDecoy: boolean } {
  let text = raw.trim();
  let isFake = false;
  let isDecoy = false;

  while (text.startsWith('*') || text.startsWith('^')) {
    if (text.startsWith('*')) isFake = true;
    if (text.startsWith('^')) isDecoy = true;
    text = text.slice(1);
  }

  const [word, pos, short, expanded] = text.split('|').map((part) => (part ?? '').trim());

  return {
    isFake,
    isDecoy,
    option: {
      word: word.toUpperCase(),
      isReal: !isFake,
      partOfSpeech: isFake ? null : POS[pos] ?? pos ?? null,
      shortDefinition: isFake ? null : short || null,
      expandedDefinition: isFake ? null : expanded || null,
    },
  };
}

export function buildRound(position: number, spec: RoundSpec): DraftRound {
  const [difficulty, roundType, rawOptions, fakeRationale, decoyRationale] = spec;
  const parsed = rawOptions.map(parseOption);

  const fake = parsed.find((entry) => entry.isFake);
  const decoy = parsed.find((entry) => entry.isDecoy);

  if (!fake) throw new Error(`Round ${position} has no option marked with * (the fake).`);
  if (!decoy) throw new Error(`Round ${position} has no option marked with ^ (the decoy).`);

  return {
    position,
    difficulty,
    roundType,
    fakeWord: fake.option.word,
    decoyWord: decoy.option.word,
    fakeRationale,
    decoyRationale,
    options: parsed.map((entry) => entry.option),
  };
}

export function buildGame(input: {
  date: string;
  gameNumber: number;
  label?: string;
  rounds: RoundSpec[];
}): DraftGame {
  return {
    activeDate: input.date,
    gameNumber: input.gameNumber,
    difficultyLabel: input.label ?? null,
    editorNotes: null,
    rounds: input.rounds.map((spec, index) => buildRound(index + 1, spec)),
  };
}
