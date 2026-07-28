import { getComparisonSettings, getFlags } from '@/lib/flags';
import { getActiveBenchmark } from '@/lib/attempts';
import { getTodaysGameSummary } from '@/lib/games';
import { getDailyStats } from '@/lib/leaderboard';
import { countSimulatedAttempts } from '@/lib/simulate';
import { estimateBenchmarkRank, DEFAULT_BENCHMARK_DISTRIBUTION } from '@/lib/benchmark';
import { formatElapsed } from '@/lib/time';
import {
  deleteSimulatedAction,
  saveBenchmarkAction,
  saveComparisonsAction,
  simulateAction,
} from '../actions';

export const dynamic = 'force-dynamic';

const SAMPLE_SCORES: Array<[number, number]> = [
  [10, 46_210],
  [10, 96_000],
  [9, 48_210],
  [8, 62_000],
  [5, 70_000],
  [2, 180_000],
];

export default async function ComparisonsPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const [settings, flags, benchmark, game, simulated] = await Promise.all([
    getComparisonSettings(),
    getFlags(),
    getActiveBenchmark(),
    getTodaysGameSummary(),
    countSimulatedAttempts(),
  ]);

  const stats = game ? await getDailyStats(game.gameId) : null;
  const distribution = benchmark?.distribution ?? DEFAULT_BENCHMARK_DISTRIBUTION;
  const population = benchmark?.population_size ?? 6000;

  return (
    <div>
      <h1 className="admin-title">Comparisons</h1>
      <p className="label">
        Real sample today: {stats?.completions ?? 0} · threshold {settings.minimumRealSampleSize} ·
        active mode {settings.mode}
      </p>

      {searchParams.error === 'distribution' ? (
        <div className="notice">That distribution JSON could not be parsed. Nothing was saved.</div>
      ) : null}

      <section style={{ marginTop: '1.5rem' }}>
        <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
          Population comparison mode
        </h2>
        <form action={saveComparisonsAction}>
          <label className="field" style={{ maxWidth: '16rem' }}>
            <span className="field__label">Mode</span>
            <select name="mode" defaultValue={settings.mode}>
              <option value="off">OFF — personal results only</option>
              <option value="real">REAL DATA — actual ranked attempts</option>
              <option value="benchmark">BENCHMARK — labelled synthetic field</option>
            </select>
          </label>
          <label className="field" style={{ maxWidth: '12rem' }}>
            <span className="field__label">Minimum real sample size</span>
            <input
              type="number"
              name="minimumRealSampleSize"
              min={1}
              defaultValue={settings.minimumRealSampleSize}
            />
          </label>

          <div className="checklist" style={{ marginBottom: '1rem' }}>
            <label>
              <input
                type="checkbox"
                name="comparisonsEnabled"
                defaultChecked={flags.player_comparisons?.enabled ?? true}
              />
              Comparison modules visible
            </label>
            <label>
              <input
                type="checkbox"
                name="benchmarkEnabled"
                defaultChecked={flags.benchmark_comparisons?.enabled ?? true}
              />
              Allow benchmark fallback
            </label>
            <label>
              <input
                type="checkbox"
                name="roundStatsEnabled"
                defaultChecked={flags.public_round_stats?.enabled ?? false}
              />
              Public per-round percentages
            </label>
          </div>

          <button type="submit" className="action">
            Save comparison settings
          </button>
        </form>
        <p className="label" style={{ marginTop: '0.8rem' }}>
          In REAL mode, comparisons fall back to the benchmark (or hide entirely if the benchmark is
          off) until the day’s sample reaches the threshold. Percentages are never computed from a
          handful of players.
        </p>
      </section>

      <hr />

      <section>
        <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
          Benchmark field
        </h2>
        {benchmark ? (
          <form action={saveBenchmarkAction}>
            <input type="hidden" name="benchmarkId" value={benchmark.id} />
            <p className="label">
              {benchmark.name} · deterministic, seeded, never shown as real players.
            </p>
            <div className="inline-form">
              <label className="field" style={{ maxWidth: '12rem' }}>
                <span className="field__label">Population size</span>
                <input
                  type="number"
                  name="populationSize"
                  min={10}
                  defaultValue={benchmark.population_size}
                />
              </label>
              <label className="field" style={{ maxWidth: '12rem' }}>
                <span className="field__label">Seed</span>
                <input type="number" name="seed" defaultValue={benchmark.seed} />
              </label>
              <label className="checklist" style={{ marginBottom: '1rem' }}>
                <span style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    name="publiclyVisible"
                    defaultChecked={benchmark.publicly_visible}
                  />
                  Visible publicly
                </span>
              </label>
            </div>
            <label className="field">
              <span className="field__label">
                Distribution (accuracy shares 0–10, lognormal time bands)
              </span>
              <textarea
                name="distribution"
                rows={12}
                defaultValue={JSON.stringify(benchmark.distribution, null, 2)}
              />
            </label>
            <button type="submit" className="action action--ghost">
              Save benchmark
            </button>
          </form>
        ) : (
          <div className="notice">No active benchmark version. Run the migration seed rows.</div>
        )}

        <h3 className="label" style={{ marginTop: '1.5rem' }}>
          Model check — estimated standing in a {population.toLocaleString()} field
        </h3>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Score</th>
              <th scope="col">Time</th>
              <th scope="col">Estimated rank</th>
              <th scope="col">Top</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_SCORES.map(([correct, ms]) => {
              const estimate = estimateBenchmarkRank(correct, ms, population, distribution);
              return (
                <tr key={`${correct}-${ms}`}>
                  <td>{correct}/10</td>
                  <td>{formatElapsed(ms)}</td>
                  <td>#{estimate.rank.toLocaleString()}</td>
                  <td>{estimate.topPercent}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="label">
          Sanity rule: every 10/10 must rank above every 9/10, and a 2/10 in three minutes must sit
          near the bottom of the field.
        </p>
      </section>

      <hr />

      <section>
        <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
          Simulated QA data
        </h2>
        <p className="label">
          {simulated.toLocaleString()} simulated attempts currently stored. They are always flagged
          <code> is_simulated = true</code> and excluded from public data unless the simulated-data
          flag is on.
        </p>

        {game ? (
          <div className="toolbar">
            {[100, 1000, 6000].map((count) => (
              <form action={simulateAction} key={count}>
                <input type="hidden" name="gameId" value={game.gameId} />
                <input type="hidden" name="count" value={count} />
                <button type="submit" className="action action--ghost">
                  Generate {count.toLocaleString()}
                </button>
              </form>
            ))}
            <form action={deleteSimulatedAction}>
              <button type="submit" className="action--quiet">
                Delete all simulated attempts
              </button>
            </form>
          </div>
        ) : (
          <div className="notice notice--quiet">
            No live game today, so there is nothing to simulate against.
          </div>
        )}
      </section>
    </div>
  );
}
