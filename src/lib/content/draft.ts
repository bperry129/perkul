/**
 * The canonical editorial shape of a game. Seed content, AI imports and the
 * admin editor all normalise to this, so one validator covers every path.
 */
import type { RoundType } from '../types';

export type DraftOption = {
  word: string;
  isReal: boolean;
  partOfSpeech?: string | null;
  shortDefinition?: string | null;
  expandedDefinition?: string | null;
};

export type DraftRound = {
  position: number;
  difficulty: number;
  roundType: RoundType;
  fakeWord: string;
  decoyWord: string;
  fakeRationale: string;
  decoyRationale: string;
  editorNotes?: string | null;
  options: DraftOption[];
};

export type DraftGame = {
  activeDate: string;
  gameNumber: number;
  difficultyLabel?: string | null;
  editorNotes?: string | null;
  rounds: DraftRound[];
};

export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

export function displayWord(word: string): string {
  return word.trim().toUpperCase();
}
