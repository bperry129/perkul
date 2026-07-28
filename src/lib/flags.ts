import 'server-only';
import { cache } from 'react';
import { serviceClient, isSupabaseConfigured } from './supabase/admin';
import type { ComparisonMode } from './types';

export type FlagKey =
  | 'player_comparisons'
  | 'real_leaderboard'
  | 'benchmark_comparisons'
  | 'grades'
  | 'signup_cta'
  | 'public_round_stats'
  | 'practice_replay'
  | 'archive'
  | 'sharing'
  | 'daily_countdown'
  | 'benchmark_population'
  | 'simulated_data';

export type FlagRecord = {
  key: string;
  enabled: boolean;
  description: string | null;
  configuration: Record<string, unknown>;
};

export const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  player_comparisons: true,
  real_leaderboard: true,
  benchmark_comparisons: true,
  grades: true,
  signup_cta: true,
  public_round_stats: false,
  practice_replay: false,
  archive: false,
  sharing: true,
  daily_countdown: true,
  benchmark_population: true,
  // Default ON so leaderboard always shows the full player field from day one.
  simulated_data: true,
};

/** Per-request memoized flag read. Flags are a handful of tiny rows. */
export const getFlags = cache(async (): Promise<Record<string, FlagRecord>> => {
  if (!isSupabaseConfigured()) return {};
  const { data, error } = await serviceClient()
    .from('feature_flags')
    .select('key, enabled, description, configuration');
  if (error || !data) return {};
  const out: Record<string, FlagRecord> = {};
  for (const row of data as FlagRecord[]) out[row.key] = row;
  return out;
});

export async function flagEnabled(key: FlagKey): Promise<boolean> {
  const flags = await getFlags();
  return flags[key]?.enabled ?? FLAG_DEFAULTS[key];
}

export type ComparisonSettings = {
  mode: ComparisonMode;
  minimumRealSampleSize: number;
  comparisonsEnabled: boolean;
  benchmarkEnabled: boolean;
};

export async function getComparisonSettings(): Promise<ComparisonSettings> {
  const flags = await getFlags();
  const cfg = (flags.player_comparisons?.configuration ?? {}) as {
    mode?: ComparisonMode;
    minimum_real_sample_size?: number;
  };
  return {
    mode: cfg.mode ?? 'benchmark',
    minimumRealSampleSize: Number(cfg.minimum_real_sample_size ?? 100),
    comparisonsEnabled: flags.player_comparisons?.enabled ?? true,
    benchmarkEnabled: flags.benchmark_comparisons?.enabled ?? true,
  };
}

export async function setFlag(
  key: string,
  patch: { enabled?: boolean; configuration?: Record<string, unknown> },
): Promise<void> {
  const existing: Record<string, unknown> = { key, updated_at: new Date().toISOString() };
  if (patch.enabled !== undefined) existing.enabled = patch.enabled;
  if (patch.configuration !== undefined) existing.configuration = patch.configuration;
  // Use upsert so the row is created on first toggle if it didn't exist yet.
  await serviceClient()
    .from('feature_flags')
    .upsert(existing, { onConflict: 'key' });
}
