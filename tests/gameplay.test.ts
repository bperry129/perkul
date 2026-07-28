import { describe, expect, it } from 'vitest';
import {
  buildOptionOrder,
  toPublicRounds,
  toPublicRoundsFromStoredOrder,
} from '@/lib/public-payload';
import { gradeFor } from '@/lib/grades';
import {
  DEFAULT_BENCHMARK_DISTRIBUTION,
  estimateBenchmarkRank,
  sampleBenchmarkAttempt,
  shareFasterInBand,
} from '@/lib/benchmark';
import { mulberry32 } from '@/lib/shuffle';
import { resolveComparisonSource, roundStatsAllowed } from '@/lib/comparison';
import type { OptionRecord, RoundRecord } from '@/lib/types';

function option(id: string, word: string, isReal: boolean, position: number): OptionRecord {
  return {
    id,
    round_id: 'round-1',
    lexicon_entry_id: null,
    position,
    display_word: word,
    normalized_word: word.toLowerCase(),
    is_real: isReal,
    part_of_speech: isReal ? 'noun' : null,
    short_definition: isReal ? 'a real definition that must not leak' : null,
    expanded_definition: isReal ? 'a longer definition that must not leak' : null,
  };
}

const round: RoundRecord = {
  id: 'round-1',
  game_id: 'game-1',
  position: 1,
  difficulty: 3,
  round_type: 'mixed',
  fake_option_id: 'o5',
  intended_decoy_option_id: 'o4',
  fake_rationale: 'secret rationale',
  decoy_rationale: 'secret decoy rationale',
  editor_notes: null,
  approved: true,
  quality_checklist: {},
  options: [
    option('o1', 'AJAR', true, 1),
    option('o2', 'AWRY', true, 2),
    option('o3', 'LITHE', true, 3),
    option('o4', 'BRUME', true, 4),
    option('o5', 'TOVEN', false, 5),
  ],
};

describe('browser payload cannot leak the answer', () => {
  const payload = toPublicRounds([round], 'attempt-abc');
  const serialized = JSON.stringify(payload);

  it('sends only opaque ids, words and display positions', () => {
    expect(Object.keys(payload[0].options[0]).sort()).toEqual(['displayPosition', 'id', 'word']);
  });

  it('contains no is_real, rationale, decoy or definition data', () => {
    expect(serialized).not.toContain('is_real');
    expect(serialized).not.toContain('isReal');
    expect(serialized).not.toContain('rationale');
    expect(serialized).not.toContain('definition');
    expect(serialized).not.toContain('decoy');
    expect(serialized).not.toContain('fake');
    expect(serialized).not.toContain('must not leak');
  });

  it('still shows all five words', () => {
    expect(payload[0].options.map((o) => o.word).sort()).toEqual([
      'AJAR',
      'AWRY',
      'BRUME',
      'LITHE',
      'TOVEN',
    ]);
  });
});

describe('per-attempt option order', () => {
  it('is deterministic for a given attempt', () => {
    const a = toPublicRounds([round], 'attempt-1');
    const b = toPublicRounds([round], 'attempt-1');
    expect(a[0].options.map((o) => o.id)).toEqual(b[0].options.map((o) => o.id));
  });

  it('differs between attempts, so answer positions cannot be shared', () => {
    const orders = new Set(
      Array.from({ length: 40 }, (_, i) =>
        toPublicRounds([round], `attempt-${i}`)[0].options.map((o) => o.id).join(','),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('does not always place the fake in the same slot', () => {
    const positions = new Set(
      Array.from({ length: 60 }, (_, i) => {
        const shown = toPublicRounds([round], `seed-${i}`)[0].options;
        return shown.findIndex((o) => o.id === 'o5');
      }),
    );
    expect(positions.size).toBeGreaterThan(2);
  });

  it('restores the exact stored order after a refresh', () => {
    const first = toPublicRounds([round], 'attempt-restore');
    const stored = buildOptionOrder(first);
    const restored = toPublicRoundsFromStoredOrder([round], stored, 'attempt-restore');
    expect(restored[0].options.map((o) => o.id)).toEqual(first[0].options.map((o) => o.id));
  });
});

describe('grades', () => {
  it('never lets a fast poor score outgrade a slow strong one', () => {
    const fastBad = gradeFor({ correct: 3, elapsedMs: 12_000 });
    const slowGood = gradeFor({ correct: 9, elapsedMs: 240_000 });
    expect(['C', 'C−', 'D', 'F']).toContain(fastBad);
    expect(slowGood.startsWith('A') || slowGood.startsWith('B')).toBe(true);
  });

  it('awards the top grade only for a perfect game', () => {
    expect(gradeFor({ correct: 10, elapsedMs: 46_000 })).toBe('A+');
    expect(gradeFor({ correct: 9, elapsedMs: 20_000 })).not.toBe('A+');
  });

  it('is monotonic in accuracy at equal time', () => {
    const order = ['F', 'D', 'C−', 'C', 'C+', 'B−', 'B', 'B+', 'A−', 'A', 'A+'];
    const grades = [0, 2, 4, 6, 8, 10].map((correct) =>
      order.indexOf(gradeFor({ correct, elapsedMs: 70_000 })),
    );
    for (let i = 1; i < grades.length; i += 1) {
      expect(grades[i]).toBeGreaterThanOrEqual(grades[i - 1]);
    }
  });

  it('gives 0/10 an F however fast it was', () => {
    expect(gradeFor({ correct: 0, elapsedMs: 6_000 })).toBe('F');
  });
});

describe('benchmark field', () => {
  it('is deterministic — the same result never moves between page loads', () => {
    const a = estimateBenchmarkRank(9, 48_210, 6000);
    const b = estimateBenchmarkRank(9, 48_210, 6000);
    expect(a).toEqual(b);
  });

  it('ranks every 10/10 above every 9/10', () => {
    const slowestPerfect = estimateBenchmarkRank(10, 600_000, 6000).rank;
    const fastestNine = estimateBenchmarkRank(9, 9_000, 6000).rank;
    expect(slowestPerfect).toBeLessThan(fastestNine);
  });

  it('puts a slow 2/10 near the bottom of a 6,000-strong field', () => {
    const estimate = estimateBenchmarkRank(2, 180_000, 6000);
    expect(estimate.rank).toBeGreaterThan(5_600);
    expect(estimate.beatPercent).toBeLessThan(10);
  });

  it('rewards speed within an accuracy band', () => {
    const fast = estimateBenchmarkRank(8, 40_000, 6000).rank;
    const slow = estimateBenchmarkRank(8, 160_000, 6000).rank;
    expect(fast).toBeLessThan(slow);
  });

  it('models a field well above random guessing', () => {
    // Random clicking averages 2/10; the modelled median must be far higher.
    const acc = DEFAULT_BENCHMARK_DISTRIBUTION.accuracy;
    let cumulative = 0;
    let median = 0;
    for (let c = 0; c <= 10; c += 1) {
      cumulative += acc[c];
      if (cumulative >= 0.5) {
        median = c;
        break;
      }
    }
    expect(median).toBeGreaterThanOrEqual(6);
  });

  it('clamps implausible times instead of exploding', () => {
    expect(shareFasterInBand(DEFAULT_BENCHMARK_DISTRIBUTION, 10, 1)).toBeGreaterThanOrEqual(0);
    expect(shareFasterInBand(DEFAULT_BENCHMARK_DISTRIBUTION, 10, 10 ** 9)).toBeLessThanOrEqual(1);
  });

  it('samples plausible simulated attempts from a seeded generator', () => {
    const rand = mulberry32(1234);
    for (let i = 0; i < 200; i += 1) {
      const sample = sampleBenchmarkAttempt(rand);
      expect(sample.correct).toBeGreaterThanOrEqual(0);
      expect(sample.correct).toBeLessThanOrEqual(10);
      expect(sample.elapsedMs).toBeGreaterThanOrEqual(DEFAULT_BENCHMARK_DISTRIBUTION.minPlausibleMs);
      expect(sample.elapsedMs).toBeLessThanOrEqual(DEFAULT_BENCHMARK_DISTRIBUTION.maxPlausibleMs);
    }
  });
});

describe('comparison feature flag and sample threshold', () => {
  const base = {
    comparisonsEnabled: true,
    benchmarkEnabled: true,
    benchmarkPubliclyVisible: true,
    minimumRealSampleSize: 100,
  };

  it('shows nothing when comparisons are switched off', () => {
    expect(
      resolveComparisonSource({ ...base, comparisonsEnabled: false, mode: 'real', realSample: 5000 })
        .source,
    ).toBe('off');
  });

  it('shows nothing in OFF mode', () => {
    expect(resolveComparisonSource({ ...base, mode: 'off', realSample: 5000 }).source).toBe('off');
  });

  it('never quotes real percentages from a tiny sample', () => {
    const decision = resolveComparisonSource({ ...base, mode: 'real', realSample: 4 });
    expect(decision.source).toBe('benchmark');
    expect(decision.reason).toBe('real_sample_too_small');
  });

  it('hides comparisons entirely when the sample is small and the benchmark is off', () => {
    expect(
      resolveComparisonSource({
        ...base,
        mode: 'real',
        realSample: 4,
        benchmarkEnabled: false,
      }).source,
    ).toBe('off');
  });

  it('switches to real data once the threshold is reached', () => {
    expect(resolveComparisonSource({ ...base, mode: 'real', realSample: 100 }).source).toBe('real');
  });

  it('gates public round statistics behind the same threshold', () => {
    expect(
      roundStatsAllowed({ publicRoundStatsEnabled: true, realSample: 99, minimumRealSampleSize: 100 }),
    ).toBe(false);
    expect(
      roundStatsAllowed({ publicRoundStatsEnabled: true, realSample: 100, minimumRealSampleSize: 100 }),
    ).toBe(true);
    expect(
      roundStatsAllowed({ publicRoundStatsEnabled: false, realSample: 5000, minimumRealSampleSize: 100 }),
    ).toBe(false);
  });
});
