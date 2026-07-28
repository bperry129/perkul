/**
 * Strict schema for an imported game bank.
 *
 * The AI is an editorial tool: it produces JSON, this file decides whether that
 * JSON is even shaped like a Perkul bank, and validation.ts decides whether the
 * content is publishable. Nothing is ever imported straight to published.
 */
import { z } from 'zod';
import { ROUND_TYPES } from './types';
import { displayWord, type DraftGame, type DraftRound } from './content/draft';

const wordSchema = z
  .string()
  .trim()
  .min(3, 'Words must be at least 3 letters')
  .max(18, 'Words must be at most 18 letters')
  .regex(/^[A-Za-z]+$/, 'Words must contain letters only');

export const optionSchema = z.object({
  word: wordSchema,
  real: z.boolean(),
  partOfSpeech: z.string().trim().max(40).optional().nullable(),
  shortDefinition: z.string().trim().max(240).optional().nullable(),
  expandedDefinition: z.string().trim().max(800).optional().nullable(),
});

export const roundSchema = z.object({
  round: z.number().int().min(1).max(10),
  difficulty: z.number().int().min(1).max(5),
  type: z.enum(ROUND_TYPES as [string, ...string[]]),
  fake: wordSchema,
  decoy: wordSchema,
  fakeRationale: z.string().trim().min(20).max(700),
  decoyRationale: z.string().trim().min(20).max(700),
  editorNotes: z.string().trim().max(700).optional().nullable(),
  options: z.array(optionSchema).length(5),
});

export const gameSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  gameNumber: z.number().int().min(1),
  difficultyLabel: z.string().trim().max(60).optional().nullable(),
  editorNotes: z.string().trim().max(700).optional().nullable(),
  rounds: z.array(roundSchema).length(10),
});

export const bankSchema = z.object({
  games: z.array(gameSchema).min(1).max(60),
});

export type BankInput = z.infer<typeof bankSchema>;

export function toDraftGames(bank: BankInput): DraftGame[] {
  return bank.games.map((game) => ({
    activeDate: game.date,
    gameNumber: game.gameNumber,
    difficultyLabel: game.difficultyLabel ?? null,
    editorNotes: game.editorNotes ?? null,
    rounds: game.rounds
      .slice()
      .sort((a, b) => a.round - b.round)
      .map<DraftRound>((round) => ({
        position: round.round,
        difficulty: round.difficulty,
        roundType: round.type as DraftRound['roundType'],
        fakeWord: displayWord(round.fake),
        decoyWord: displayWord(round.decoy),
        fakeRationale: round.fakeRationale,
        decoyRationale: round.decoyRationale,
        editorNotes: round.editorNotes ?? null,
        options: round.options.map((option) => ({
          word: displayWord(option.word),
          isReal: option.real,
          partOfSpeech: option.partOfSpeech ?? null,
          shortDefinition: option.shortDefinition ?? null,
          expandedDefinition: option.expandedDefinition ?? null,
        })),
      })),
  }));
}

export type ParseResult =
  | { ok: true; games: DraftGame[] }
  | { ok: false; message: string; issues: string[] };

export function parseBank(raw: unknown): ParseResult {
  const parsed = bankSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: 'The pasted JSON does not match the import schema.',
      issues: parsed.error.issues.slice(0, 40).map((i) => `${i.path.join('.') || 'root'}: ${i.message}`),
    };
  }
  return { ok: true, games: toDraftGames(parsed.data) };
}

export function parseBankText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      message: 'That is not valid JSON.',
      issues: [(error as Error).message],
    };
  }
  return parseBank(raw);
}

/** Human-readable schema published in the generation prompt. */
export const IMPORT_SCHEMA_DOC = `{
  "games": [
    {
      "date": "YYYY-MM-DD",
      "gameNumber": 21,
      "difficultyLabel": "optional short label",
      "rounds": [
        {
          "round": 1,
          "difficulty": 2,
          "type": "one of: ${ROUND_TYPES.join(' | ')}",
          "fake": "FABRICATEDWORD",
          "decoy": "REALBUTSUSPICIOUSWORD",
          "fakeRationale": "Why the fabricated word reads as believable English (>= 20 chars).",
          "decoyRationale": "Why the legitimate decoy looks suspicious (>= 20 chars).",
          "options": [
            {
              "word": "REALWORD",
              "real": true,
              "partOfSpeech": "noun",
              "shortDefinition": "A concise definition, one line.",
              "expandedDefinition": "One or two sentences of additional context."
            },
            { "word": "FABRICATEDWORD", "real": false }
          ]
        }
      ]
    }
  ]
}

Rules enforced on import:
- exactly 10 rounds per game, positions 1..10
- exactly 5 options per round: exactly 4 with "real": true and exactly 1 with "real": false
- "fake" must match the single option with "real": false
- "decoy" must match one of the four real options
- every real option requires partOfSpeech and shortDefinition
- letters only, 3-18 characters, no spaces, hyphens, digits or periods`;
