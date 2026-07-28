/**
 * Which comparison source a result is allowed to use.
 *
 * Pure decision function so the "never quote percentages from four players"
 * rule is directly testable.
 */
import type { ComparisonMode } from './types';

export type ComparisonInput = {
  /** admin-selected mode */
  mode: ComparisonMode;
  comparisonsEnabled: boolean;
  benchmarkEnabled: boolean;
  benchmarkPubliclyVisible: boolean;
  /** legitimate ranked completions for this game today */
  realSample: number;
  minimumRealSampleSize: number;
};

export type ComparisonDecision = {
  source: 'off' | 'real' | 'benchmark';
  reason:
    | 'comparisons_disabled'
    | 'mode_off'
    | 'real_sample_sufficient'
    | 'real_sample_too_small'
    | 'benchmark_unavailable';
};

export function resolveComparisonSource(input: ComparisonInput): ComparisonDecision {
  if (!input.comparisonsEnabled) return { source: 'off', reason: 'comparisons_disabled' };
  if (input.mode === 'off') return { source: 'off', reason: 'mode_off' };

  const benchmarkAvailable = input.benchmarkEnabled && input.benchmarkPubliclyVisible;

  if (input.mode === 'real') {
    if (input.realSample >= input.minimumRealSampleSize) {
      return { source: 'real', reason: 'real_sample_sufficient' };
    }
    // Too few real players: fall back to the labelled benchmark, or show nothing.
    return benchmarkAvailable
      ? { source: 'benchmark', reason: 'real_sample_too_small' }
      : { source: 'off', reason: 'real_sample_too_small' };
  }

  return benchmarkAvailable
    ? { source: 'benchmark', reason: 'real_sample_too_small' }
    : { source: 'off', reason: 'benchmark_unavailable' };
}

/** Round statistics need a real, non-trivial sample regardless of mode. */
export function roundStatsAllowed(input: {
  publicRoundStatsEnabled: boolean;
  realSample: number;
  minimumRealSampleSize: number;
}): boolean {
  return input.publicRoundStatsEnabled && input.realSample >= input.minimumRealSampleSize;
}
