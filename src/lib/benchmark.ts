/**
 * Synthetic benchmark field.
 *
 * Before real traffic exists we still want a player to know whether 8/10 in
 * 1:02 is good. The benchmark is an analytic, seeded, deterministic model of a
 * realistic word-game audience: no random numbers at request time, so the same
 * result always produces the same estimated rank.
 *
 * It is always labelled as a benchmark field in the UI. Synthetic entries are
 * never presented as real people and never enter the real leaderboard.
 */

export type TimeBand = { medianMs: number; logSd: number };

export type BenchmarkDistribution = {
  /** index 0..10 => share of the field scoring exactly that many correct */
  accuracy: number[];
  timeByAccuracy: Record<string, TimeBand>;
  minPlausibleMs: number;
  maxPlausibleMs: number;
};

export type BenchmarkVersion = {
  id: string;
  name: string;
  populationSize: number;
  seed: number;
  distribution: BenchmarkDistribution;
  publiclyVisible: boolean;
  version: number;
};

export const DEFAULT_BENCHMARK_DISTRIBUTION: BenchmarkDistribution = {
  accuracy: [0.004, 0.01, 0.022, 0.045, 0.078, 0.118, 0.157, 0.181, 0.166, 0.128, 0.091],
  timeByAccuracy: {
    '0': { medianMs: 42_000, logSd: 0.62 },
    '1': { medianMs: 46_000, logSd: 0.6 },
    '2': { medianMs: 52_000, logSd: 0.58 },
    '3': { medianMs: 58_000, logSd: 0.56 },
    '4': { medianMs: 63_000, logSd: 0.54 },
    '5': { medianMs: 68_000, logSd: 0.52 },
    '6': { medianMs: 73_000, logSd: 0.5 },
    '7': { medianMs: 78_000, logSd: 0.48 },
    '8': { medianMs: 83_000, logSd: 0.46 },
    '9': { medianMs: 89_000, logSd: 0.45 },
    '10': { medianMs: 96_000, logSd: 0.44 },
  },
  minPlausibleMs: 9_000,
  maxPlausibleMs: 900_000,
};

/** Abramowitz & Stegun 7.1.26 error function approximation. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function normalizeAccuracy(dist: BenchmarkDistribution): number[] {
  const raw = dist.accuracy.slice(0, 11);
  while (raw.length < 11) raw.push(0);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((v) => Math.max(0, v) / sum);
}

function band(dist: BenchmarkDistribution, correct: number): TimeBand {
  return dist.timeByAccuracy[String(correct)] ?? { medianMs: 70_000, logSd: 0.5 };
}

/**
 * Share of the accuracy band that finished strictly faster than elapsedMs.
 * Times are modelled lognormally, which matches observed puzzle completion data
 * far better than a normal distribution.
 */
export function shareFasterInBand(
  dist: BenchmarkDistribution,
  correct: number,
  elapsedMs: number,
): number {
  const { medianMs, logSd } = band(dist, correct);
  const clamped = Math.min(
    Math.max(elapsedMs, dist.minPlausibleMs),
    dist.maxPlausibleMs,
  );
  const z = (Math.log(clamped) - Math.log(medianMs)) / (logSd || 0.5);
  return Math.min(1, Math.max(0, normalCdf(z)));
}

export type BenchmarkEstimate = {
  /** 1-based estimated position in the field (1 = best) */
  rank: number;
  populationSize: number;
  /** 0..100, "you are in the top N%" */
  topPercent: number;
  /** 0..100, "you beat N% of the field" */
  beatPercent: number;
};

/**
 * Accuracy is the dominant axis: everyone with more correct answers ranks ahead
 * of you no matter how fast you were.
 */
export function estimateBenchmarkRank(
  correct: number,
  elapsedMs: number,
  populationSize: number,
  distribution: BenchmarkDistribution = DEFAULT_BENCHMARK_DISTRIBUTION,
): BenchmarkEstimate {
  const acc = normalizeAccuracy(distribution);
  const clampedCorrect = Math.min(10, Math.max(0, Math.round(correct)));
  const pop = Math.max(1, Math.round(populationSize));

  // Everyone with a higher score sits strictly above this player. Bands are
  // carved out of the field first, then position inside the band is decided by
  // time — so no amount of speed can ever cross an accuracy boundary.
  let shareAbove = 0;
  for (let c = clampedCorrect + 1; c <= 10; c += 1) shareAbove += acc[c];
  const shareIncluding = shareAbove + acc[clampedCorrect];

  const bandStart = Math.floor(shareAbove * pop) + 1;
  const bandEnd = Math.max(bandStart, Math.floor(shareIncluding * pop));
  const faster = shareFasterInBand(distribution, clampedCorrect, elapsedMs);

  const rank = Math.min(
    pop,
    Math.max(1, bandStart + Math.round(faster * (bandEnd - bandStart))),
  );
  const beatPercent = ((pop - rank) / pop) * 100;
  const topPercent = (rank / pop) * 100;

  return {
    rank,
    populationSize: pop,
    topPercent: Math.max(0.1, Math.round(topPercent * 10) / 10),
    beatPercent: Math.max(0, Math.round(beatPercent * 10) / 10),
  };
}

/** Percentile of a score within the benchmark field, 0..100 (higher better). */
export function benchmarkPercentile(
  correct: number,
  elapsedMs: number,
  distribution: BenchmarkDistribution = DEFAULT_BENCHMARK_DISTRIBUTION,
): number {
  const est = estimateBenchmarkRank(correct, elapsedMs, 10_000, distribution);
  return est.beatPercent;
}

/**
 * Seeded sampler used only by the QA "simulated attempts" generator. Never used
 * for player-facing estimates (those are analytic and stable).
 */
export function sampleBenchmarkAttempt(
  rand: () => number,
  distribution: BenchmarkDistribution = DEFAULT_BENCHMARK_DISTRIBUTION,
): { correct: number; elapsedMs: number } {
  const acc = normalizeAccuracy(distribution);
  const roll = rand();
  let cumulative = 0;
  let correct = 10;
  for (let c = 0; c <= 10; c += 1) {
    cumulative += acc[c];
    if (roll <= cumulative) {
      correct = c;
      break;
    }
  }
  const { medianMs, logSd } = band(distribution, correct);
  // Box-Muller for a lognormal draw.
  const u1 = Math.max(1e-9, rand());
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const elapsedMs = Math.round(
    Math.min(
      distribution.maxPlausibleMs,
      Math.max(distribution.minPlausibleMs, Math.exp(Math.log(medianMs) + z * logSd)),
    ),
  );
  return { correct, elapsedMs };
}
