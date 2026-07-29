import { describe, expect, it } from 'vitest';
import { SEED_GAMES } from '@/content';
import { BRAND } from '@/lib/brand';
import { FIXTURE_ROUND } from '@/content/fixtures';
import { buildGame } from '@/content/format';
import { normalizeWord } from '@/lib/content/draft';
import { EMPTY_HISTORY, validateBank, validateGame, summarizeBank } from '@/lib/validation';
import { parseBank, parseBankText } from '@/lib/import-schema';
import { buildGenerationPrompt } from '@/lib/prompt';
import { addDays } from '@/lib/time';

const acceptedFromBank = () => {
  const accepted = new Set<string>();
  for (const game of SEED_GAMES) {
    for (const round of game.rounds) {
      for (const option of round.options) {
        if (option.isReal) accepted.add(normalizeWord(option.word));
      }
    }
  }
  return accepted;
};

describe('the initial 20-day bank', () => {
  const summary = summarizeBank(SEED_GAMES);

  it('covers 2026-07-28 through 2026-08-16, numbered from BRAND.firstGameNumber', () => {
    expect(SEED_GAMES).toHaveLength(20);
    const expectedDates = Array.from({ length: 20 }, (_, i) => addDays('2026-07-28', i));
    expect(summary.dates).toEqual(expectedDates);
    // The bank deliberately does not start at #1: launch day is
    // BRAND.firstGameNumber (#210), so the game does not look brand new on
    // the day it opens.
    expect(SEED_GAMES.map((g) => g.gameNumber).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => BRAND.firstGameNumber + i),
    );
  });

  it('has 200 rounds and 1,000 displayed options', () => {
    expect(summary.rounds).toBe(200);
    expect(summary.options).toBe(1000);
  });

  it('has exactly one fake and four real words in every round', () => {
    for (const game of SEED_GAMES) {
      for (const round of game.rounds) {
        expect(round.options).toHaveLength(5);
        expect(round.options.filter((o) => !o.isReal)).toHaveLength(1);
        expect(round.options.filter((o) => o.isReal)).toHaveLength(4);
      }
    }
  });

  it('never reuses a fabricated word', () => {
    const fakes = SEED_GAMES.flatMap((g) => g.rounds.map((r) => normalizeWord(r.fakeWord)));
    expect(new Set(fakes).size).toBe(fakes.length);
    expect(fakes).toHaveLength(200);
  });

  it('never uses a word that appears as a real word elsewhere in the bank as a fake', () => {
    const accepted = acceptedFromBank();
    for (const game of SEED_GAMES) {
      for (const round of game.rounds) {
        expect(accepted.has(normalizeWord(round.fakeWord))).toBe(false);
      }
    }
  });

  it('names an intended decoy that is one of the four real words', () => {
    for (const game of SEED_GAMES) {
      for (const round of game.rounds) {
        const decoy = round.options.find((o) => normalizeWord(o.word) === normalizeWord(round.decoyWord));
        expect(decoy, `${game.activeDate} round ${round.position}`).toBeTruthy();
        expect(decoy?.isReal).toBe(true);
      }
    }
  });

  it('defines every real word and explains every round', () => {
    for (const game of SEED_GAMES) {
      for (const round of game.rounds) {
        expect(round.fakeRationale.length).toBeGreaterThan(20);
        expect(round.decoyRationale.length).toBeGreaterThan(20);
        for (const option of round.options.filter((o) => o.isReal)) {
          expect(option.shortDefinition, option.word).toBeTruthy();
          expect(option.partOfSpeech, option.word).toBeTruthy();
        }
      }
    }
  });

  it('keeps at most one strongly patterned round per game', () => {
    for (const game of SEED_GAMES) {
      const patterned = game.rounds.filter(
        (r) => r.roundType === 'visual-family' || r.roundType === 'spelling-pattern',
      );
      expect(patterned.length, game.activeDate).toBeLessThanOrEqual(1);
    }
  });

  it('climbs in difficulty from the opening rounds to the closing rounds', () => {
    for (const game of SEED_GAMES) {
      const early = game.rounds.filter((r) => r.position <= 3);
      const late = game.rounds.filter((r) => r.position >= 8);
      const avg = (rows: typeof early) => rows.reduce((t, r) => t + r.difficulty, 0) / rows.length;
      expect(avg(late), game.activeDate).toBeGreaterThan(avg(early));
      expect(game.rounds[9].difficulty).toBe(5);
    }
  });

  it('uses letters only — no proper nouns with punctuation, no abbreviations', () => {
    for (const game of SEED_GAMES) {
      for (const round of game.rounds) {
        for (const option of round.options) {
          expect(option.word).toMatch(/^[A-Z]{3,18}$/);
        }
      }
    }
  });

  it('passes the full validator with no errors and no warnings', () => {
    const { reports, ok } = validateBank(SEED_GAMES, {
      ...EMPTY_HISTORY,
      acceptedLexicon: acceptedFromBank(),
    });
    const errors = reports.flatMap((r) => r.report.errors.map((i) => i.message));
    const warnings = reports.flatMap((r) => r.report.warnings.map((i) => i.message));
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe('the development fixture', () => {
  it('matches the brief: TOVEN is fake, BRUME is the decoy', () => {
    expect(FIXTURE_ROUND.fakeWord).toBe('TOVEN');
    expect(FIXTURE_ROUND.decoyWord).toBe('BRUME');
    expect(FIXTURE_ROUND.options.find((o) => o.word === 'TOVEN')?.isReal).toBe(false);
    expect(FIXTURE_ROUND.options.find((o) => o.word === 'BRUME')?.isReal).toBe(true);
    expect(FIXTURE_ROUND.fakeRationale).toMatch(/WOVEN/);
    expect(FIXTURE_ROUND.decoyRationale).toMatch(/mist or fog/);
  });

  it('is not scheduled as a published daily game', () => {
    expect(SEED_GAMES.some((g) => g.rounds.some((r) => r.fakeWord === 'TOVEN'))).toBe(false);
  });
});

describe('validator rejects broken content', () => {
  // Synthetic words must obey the same letters-only rule as real content.
  const tag = (position: number) => 'ABCDEFGHIJ'[position - 1] ?? 'Z';

  const goodRound = (position: number, difficulty: number) =>
    [
      difficulty,
      'mixed',
      [
        `ANCHORONE${tag(position)}|n|a definition`,
        `ANCHORTWO${tag(position)}|n|a definition`,
        `ANCHORSIX${tag(position)}|n|a definition`,
        `^DECOYWORD${tag(position)}|n|a definition`,
        `*FAKEWORD${tag(position)}`,
      ],
      'A rationale long enough to satisfy the validator rules.',
      'A decoy rationale long enough to satisfy the validator rules.',
    ] as const;

  const makeGame = (count: number) =>
    buildGame({
      date: '2030-01-01',
      gameNumber: 500,
      rounds: Array.from({ length: count }, (_, i) =>
        goodRound(i + 1, i < 3 ? 1 : i < 8 ? 3 : 5),
      ) as never,
    });

  it('requires exactly ten rounds', () => {
    const report = validateGame(makeGame(9));
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.code === 'round_count')).toBe(true);
  });

  it('accepts a well-formed game', () => {
    expect(validateGame(makeGame(10)).ok).toBe(true);
  });

  it('rejects a fake that exists in the accepted lexicon', () => {
    const game = makeGame(10);
    const report = validateGame(game, {
      ...EMPTY_HISTORY,
      acceptedLexicon: new Set([normalizeWord(game.rounds[0].fakeWord)]),
    });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.code === 'fake_is_real')).toBe(true);
  });

  it('rejects a fake that has been used before', () => {
    const game = makeGame(10);
    const report = validateGame(game, {
      ...EMPTY_HISTORY,
      usedFakeWords: new Set([normalizeWord(game.rounds[3].fakeWord)]),
    });
    expect(report.errors.some((e) => e.code === 'fake_reused')).toBe(true);
  });

  it('rejects two rounds sharing a word inside one game', () => {
    const game = makeGame(10);
    game.rounds[1].options[0].word = game.rounds[0].options[0].word;
    const report = validateGame(game);
    expect(report.errors.some((e) => e.code === 'duplicate_in_game')).toBe(true);
  });

  it('rejects a round with two fabrications', () => {
    const game = makeGame(10);
    game.rounds[0].options[1].isReal = false;
    const report = validateGame(game);
    expect(report.errors.some((e) => e.code === 'fake_count')).toBe(true);
  });

  it('rejects a missing definition', () => {
    const game = makeGame(10);
    game.rounds[0].options[0].shortDefinition = null;
    const report = validateGame(game);
    expect(report.errors.some((e) => e.code === 'missing_definition')).toBe(true);
  });

  it('rejects a decoy that is the fake', () => {
    const game = makeGame(10);
    game.rounds[0].decoyWord = game.rounds[0].fakeWord;
    const report = validateGame(game);
    expect(report.errors.some((e) => e.code === 'decoy_not_real')).toBe(true);
  });

  it('detects a duplicate fake across a whole batch', () => {
    const a = makeGame(10);
    const b = buildGame({
      date: '2030-01-02',
      gameNumber: 501,
      rounds: Array.from({ length: 10 }, (_, i) =>
        goodRound(i + 1, i < 3 ? 1 : i < 8 ? 3 : 5),
      ) as never,
    });
    const { ok, reports } = validateBank([a, b]);
    expect(ok).toBe(false);
    expect(
      reports[1].report.errors.some((e) => e.code === 'fake_reused'),
    ).toBe(true);
  });
});

describe('import schema', () => {
  const letters = 'ABCDEFGHIJ';
  const validGame = {
    date: '2026-08-17',
    gameNumber: 21,
    rounds: Array.from({ length: 10 }, (_, i) => {
      const s = letters[i];
      return {
        round: i + 1,
        difficulty: 3,
        type: 'mixed',
        fake: `MADEUPWORD${s}`,
        decoy: `DECOYWORD${s}`,
        fakeRationale: 'A rationale of sufficient length for the schema.',
        decoyRationale: 'A decoy rationale of sufficient length for the schema.',
        options: [
          { word: `ANCHORONE${s}`, real: true, partOfSpeech: 'noun', shortDefinition: 'def' },
          { word: `ANCHORTWO${s}`, real: true, partOfSpeech: 'noun', shortDefinition: 'def' },
          { word: `ANCHORSIX${s}`, real: true, partOfSpeech: 'noun', shortDefinition: 'def' },
          { word: `DECOYWORD${s}`, real: true, partOfSpeech: 'noun', shortDefinition: 'def' },
          { word: `MADEUPWORD${s}`, real: false },
        ],
      };
    }),
  };

  it('accepts a well-formed bank', () => {
    const parsed = parseBank({ games: [validGame] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.games[0].rounds).toHaveLength(10);
      expect(parsed.games[0].rounds[0].fakeWord).toBe('MADEUPWORDA');
    }
  });

  it('rejects a game with nine rounds', () => {
    const parsed = parseBank({ games: [{ ...validGame, rounds: validGame.rounds.slice(0, 9) }] });
    expect(parsed.ok).toBe(false);
  });

  it('rejects six options in a round', () => {
    const broken = structuredClone(validGame);
    broken.rounds[0].options.push({
      word: 'EXTRAWORD',
      real: true,
      partOfSpeech: 'noun',
      shortDefinition: 'def',
    });
    expect(parseBank({ games: [broken] }).ok).toBe(false);
  });

  it('rejects words containing spaces, digits or punctuation', () => {
    const broken = structuredClone(validGame);
    broken.rounds[0].options[0].word = 'TWO WORDS';
    expect(parseBank({ games: [broken] }).ok).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(parseBank({ games: [{ ...validGame, date: '17/08/2026' }] }).ok).toBe(false);
  });

  it('reports invalid JSON without throwing', () => {
    const parsed = parseBankText('{not json');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toMatch(/not valid JSON/);
  });
});

describe('generation prompt', () => {
  it('includes the dates, the historical fakes and the schema', () => {
    const prompt = buildGenerationPrompt({
      days: 20,
      startDate: '2026-08-17',
      startGameNumber: 21,
      history: {
        ...EMPTY_HISTORY,
        usedFakeWords: new Set(['morrent', 'toven']),
        recentDecoys: new Map([['cavil', '2026-08-16']]),
        recentRealWords: new Map([['dearth', '2026-08-16']]),
      },
    });

    expect(prompt).toContain('2026-08-17');
    expect(prompt).toContain('2026-09-05');
    expect(prompt).toContain('game #021');
    expect(prompt).toContain('MORRENT');
    expect(prompt).toContain('TOVEN');
    expect(prompt).toContain('CAVIL');
    expect(prompt).toContain('DEARTH');
    expect(prompt).toContain('"games"');
    expect(prompt).toMatch(/Return ONLY JSON/);
  });
});
