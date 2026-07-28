/**
 * Grades are decoration, never ranking.
 *
 * Leaderboard order is always correct DESC then elapsed ASC. The grade is a
 * readable summary: accuracy sets the band, speed can nudge it one step inside
 * that band. A very fast 3/10 can never outgrade a slow 9/10.
 */
import {
  DEFAULT_BENCHMARK_DISTRIBUTION,
  shareFasterInBand,
  type BenchmarkDistribution,
} from './benchmark';

export type Grade =
  | 'A+'
  | 'A'
  | 'A−'
  | 'B+'
  | 'B'
  | 'B−'
  | 'C+'
  | 'C'
  | 'C−'
  | 'D'
  | 'F';

/** [fast, typical, slow] within the accuracy band. */
const GRADE_TABLE: Record<number, [Grade, Grade, Grade]> = {
  10: ['A+', 'A+', 'A'],
  9: ['A', 'A', 'A−'],
  8: ['A−', 'B+', 'B+'],
  7: ['B+', 'B', 'B'],
  6: ['B', 'B−', 'B−'],
  5: ['B−', 'C+', 'C+'],
  4: ['C+', 'C', 'C'],
  3: ['C', 'C−', 'C−'],
  2: ['C−', 'D', 'D'],
  1: ['D', 'D', 'F'],
  0: ['F', 'F', 'F'],
};

export type GradeInput = {
  correct: number;
  rounds?: number;
  elapsedMs: number;
  /** 0..100 percentile among same-accuracy players, if real data is used */
  realSpeedPercentile?: number | null;
  distribution?: BenchmarkDistribution;
};

export function gradeFor({
  correct,
  rounds = 10,
  elapsedMs,
  realSpeedPercentile = null,
  distribution = DEFAULT_BENCHMARK_DISTRIBUTION,
}: GradeInput): Grade {
  const scaled = rounds === 10 ? correct : Math.round((correct / Math.max(1, rounds)) * 10);
  const band = GRADE_TABLE[Math.min(10, Math.max(0, scaled))];

  // Share of the same-accuracy field that was faster. Lower = you were quick.
  const shareFaster =
    realSpeedPercentile != null
      ? Math.min(1, Math.max(0, 1 - realSpeedPercentile / 100))
      : shareFasterInBand(distribution, Math.min(10, Math.max(0, scaled)), elapsedMs);

  const tier = shareFaster <= 0.25 ? 0 : shareFaster <= 0.75 ? 1 : 2;
  return band[tier];
}

export function gradeIsHonours(grade: Grade): boolean {
  return grade.startsWith('A');
}
