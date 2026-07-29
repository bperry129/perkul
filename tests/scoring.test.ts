import { describe, expect, it } from 'vitest';
import {
  compareRanked,
  computeStreaks,
  evaluateIntegrity,
  formatPoints,
  maxPerkulScore,
  percentileFromRank,
  perkulScore,
  rankWithin,
  scoreBreakdown,
  sortLeaderboard,
} from '@/lib/scoring';

import { buildShareText } from '@/lib/share';

describe('leaderboard ranking', () => {
  // THE RULE: most right in the least time wins. Accuracy dominates normal
  // play (one correct answer is worth ~125 seconds), but the clock genuinely
  // counts, so a pathologically slow perfect game can lose.
  it('puts a 10/10 above a much faster 9/10 within normal play', () => {
    const perfectSlow = { correctCount: 10, elapsedMs: 72_450 };
    const nineFast = { correctCount: 9, elapsedMs: 31_820 };
    expect(compareRanked(perfectSlow, nineFast)).toBeLessThan(0);
    expect(sortLeaderboard([nineFast, perfectSlow])[0]).toBe(perfectSlow);
  });

  it('still puts a 10/10 in 2:00 above a 9/10 in 1:00', () => {
    const perfect = { correctCount: 10, elapsedMs: 120_000 }; // 9,040
    const nine = { correctCount: 9, elapsedMs: 60_000 }; //      8,520
    expect(perkulScore(10, 120_000)).toBeGreaterThan(perkulScore(9, 60_000));
    expect(sortLeaderboard([nine, perfect])[0]).toBe(perfect);
  });

  it('puts a 10/10 that took an hour BELOW a 9/10 that took a minute', () => {
    const perfectHour = { correctCount: 10, elapsedMs: 60 * 60 * 1000 }; // 0
    const nineFast = { correctCount: 9, elapsedMs: 60_000 }; //             8,520
    expect(compareRanked(nineFast, perfectHour)).toBeLessThan(0);
    const sorted = sortLeaderboard([perfectHour, nineFast]);
    expect(sorted[0]).toBe(nineFast);
    expect(sorted[0].correctCount).toBe(9);
  });

  it('never returns a negative score', () => {
    expect(perkulScore(0, 6 * 60 * 60 * 1000)).toBe(0);
    expect(perkulScore(10, 6 * 60 * 60 * 1000)).toBe(0);
    expect(perkulScore(10, -5_000)).toBe(10 * 1000);
  });

  it('crosses over well outside real play (~4 minutes per answer margin)', () => {
    // A perfect game stays ahead of a fast 9/10 for over three minutes.
    expect(perkulScore(10, 180_000)).toBeGreaterThan(perkulScore(9, 60_000));
    // By five minutes it has fallen behind.
    expect(perkulScore(10, 300_000)).toBeLessThan(perkulScore(9, 60_000));
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

describe('points shown on the results page', () => {
  it('is out of 10,000 for a ten-round game', () => {
    expect(maxPerkulScore(10)).toBe(10_000);
    expect(maxPerkulScore(5)).toBe(5_000);
    // Defaults to the standard ten rounds.
    expect(maxPerkulScore()).toBe(10_000);
  });

  it('itemises the same number the ladder sorts on', () => {
    const shown = scoreBreakdown(9, 60_000);
    expect(shown.score).toBe(perkulScore(9, 60_000)); // 8,520
    expect(shown.maxScore).toBe(10_000);
    expect(shown.gross).toBe(9_000);
    expect(shown.penalty).toBe(480);
    expect(shown.gross - shown.penalty).toBe(shown.score);
  });

  it('never displays arithmetic that undercuts the zero floor', () => {
    // A 10/10 left open an hour scores 0; the shown penalty is capped at gross
    // so "10,000 − 28,800" is never printed.
    const shown = scoreBreakdown(10, 60 * 60 * 1000);
    expect(shown.score).toBe(0);
    expect(shown.penalty).toBe(10_000);
    expect(shown.penaltyUncapped).toBe(28_800);
    expect(shown.gross - shown.penalty).toBe(shown.score);
  });

  it('formats points with grouped thousands', () => {
    expect(formatPoints(10_000)).toBe('10,000');
    expect(formatPoints(8_520)).toBe('8,520');
    expect(formatPoints(0)).toBe('0');
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
