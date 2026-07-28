import { describe, expect, it } from 'vitest';
import {
  compareRanked,
  computeStreaks,
  evaluateIntegrity,
  percentileFromRank,
  rankWithin,
  sortLeaderboard,
} from '@/lib/scoring';
import { buildShareText } from '@/lib/share';

describe('leaderboard ranking', () => {
  it('puts a 10/10 above a much faster 9/10 (the fundamental rule)', () => {
    const perfectSlow = { correctCount: 10, elapsedMs: 72_450 };
    const nineFast = { correctCount: 9, elapsedMs: 31_820 };
    expect(compareRanked(perfectSlow, nineFast)).toBeLessThan(0);
    expect(sortLeaderboard([nineFast, perfectSlow])[0]).toBe(perfectSlow);
  });

  it('never lets speed compensate for accuracy at any margin', () => {
    const pool = [
      { correctCount: 9, elapsedMs: 1 },
      { correctCount: 10, elapsedMs: 6 * 60 * 60 * 1000 - 1 },
    ];
    const sorted = sortLeaderboard(pool);
    expect(sorted[0].correctCount).toBe(10);
  });

  it('breaks ties on time, then on who finished first', () => {
    const a = { correctCount: 10, elapsedMs: 46_210, completedAt: '2026-07-28T12:00:00Z' };
    const b = { correctCount: 10, elapsedMs: 46_210, completedAt: '2026-07-28T11:00:00Z' };
    const c = { correctCount: 10, elapsedMs: 53_880 };
    const sorted = sortLeaderboard([c, a, b]);
    expect(sorted.map((r) => r.elapsedMs)).toEqual([46_210, 46_210, 53_880]);
    expect(sorted[0]).toBe(b);
  });

  it('produces the documented example ordering', () => {
    const rows = [
      { name: 'CrosswordDad', correctCount: 9, elapsedMs: 38_720 },
      { name: 'LexiconKing', correctCount: 10, elapsedMs: 46_210 },
      { name: 'FakeHunter', correctCount: 9, elapsedMs: 49_010 },
      { name: 'BrumeBoy', correctCount: 10, elapsedMs: 64_170 },
      { name: 'WordNerd', correctCount: 10, elapsedMs: 53_880 },
    ];
    expect(sortLeaderboard(rows).map((r) => r.name)).toEqual([
      'LexiconKing',
      'WordNerd',
      'BrumeBoy',
      'CrosswordDad',
      'FakeHunter',
    ]);
  });

  it('computes a 1-based rank within a pool', () => {
    const pool = [
      { correctCount: 10, elapsedMs: 40_000 },
      { correctCount: 10, elapsedMs: 50_000 },
      { correctCount: 9, elapsedMs: 20_000 },
    ];
    expect(rankWithin({ correctCount: 9, elapsedMs: 20_000 }, pool)).toBe(3);
    expect(rankWithin({ correctCount: 10, elapsedMs: 45_000 }, pool)).toBe(2);
  });

  it('turns rank into a percentile', () => {
    expect(percentileFromRank(1, 100)).toBeCloseTo(99);
    expect(percentileFromRank(100, 100)).toBe(0);
    expect(percentileFromRank(5, 0)).toBe(0);
  });
});

describe('streaks (America/New_York calendar dates)', () => {
  it('counts consecutive days ending today', () => {
    const streaks = computeStreaks(
      ['2026-07-26', '2026-07-27', '2026-07-28'],
      '2026-07-28',
    );
    expect(streaks.current).toBe(3);
    expect(streaks.longest).toBe(3);
  });

  it('still counts a streak that ends yesterday', () => {
    const streaks = computeStreaks(['2026-07-26', '2026-07-27'], '2026-07-28');
    expect(streaks.current).toBe(2);
  });

  it('breaks the current streak when a day is missed', () => {
    const streaks = computeStreaks(
      ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-28'],
      '2026-07-28',
    );
    expect(streaks.current).toBe(1);
    expect(streaks.longest).toBe(3);
  });

  it('tolerates duplicates (a replay does not extend a streak)', () => {
    const streaks = computeStreaks(['2026-07-28', '2026-07-28'], '2026-07-28');
    expect(streaks.current).toBe(1);
  });

  it('returns zero for a player with no ranked completions', () => {
    expect(computeStreaks([], '2026-07-28')).toEqual({ current: 0, longest: 0 });
  });
});

describe('attempt integrity', () => {
  const base = {
    elapsedMs: 60_000,
    roundsTotal: 10,
    answeredRounds: 10,
    distinctRounds: 10,
    optionsValid: true,
    gameIsLive: true,
    duplicateCompletion: false,
  };

  it('accepts an ordinary completion', () => {
    expect(evaluateIntegrity(base).status).toBe('valid');
  });

  it('flags impossibly fast completions as suspicious', () => {
    expect(evaluateIntegrity({ ...base, elapsedMs: 900 }).status).toBe('suspicious');
  });

  it('flags a session left open for many hours', () => {
    expect(evaluateIntegrity({ ...base, elapsedMs: 9 * 60 * 60 * 1000 }).status).toBe('suspicious');
  });

  it('sends tampered option submissions to admin review', () => {
    expect(evaluateIntegrity({ ...base, optionsValid: false }).status).toBe('admin_review');
  });

  it('sends incomplete submissions to admin review', () => {
    expect(evaluateIntegrity({ ...base, answeredRounds: 9, distinctRounds: 9 }).status).toBe(
      'admin_review',
    );
  });

  it('makes an expired game unrankable', () => {
    const verdict = evaluateIntegrity({ ...base, gameIsLive: false });
    expect(verdict.status).toBe('unranked');
    expect(verdict.notes.join(' ')).toMatch(/no longer live/);
  });
});

describe('share text', () => {
  it('is spoiler-free', () => {
    const text = buildShareText({
      gameNumber: 1,
      correctCount: 9,
      roundsTotal: 10,
      elapsedMs: 51_820,
      marks: [true, true, true, false, true, true, true, true, true, true],
      grade: 'A−',
    });
    expect(text).toContain('#001');
    expect(text).toContain('9/10 · 0:51.82');
    expect(text).toContain('✓ ✓ ✓ ✕ ✓ ✓ ✓ ✓ ✓ ✓');
    expect(text).toContain('A−');
    // No puzzle words, ever — the only uppercase run allowed is the brand name.
    expect(text.replace(/PERKUL/g, '')).not.toMatch(/[A-Z]{3,}/);
  });
});
