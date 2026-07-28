import { getFlags, FLAG_DEFAULTS } from '@/lib/flags';
import { toggleFlagAction } from '../actions';

export const dynamic = 'force-dynamic';

const DESCRIPTIONS: Record<string, string> = {
  player_comparisons: 'Population comparison modules on the results screen.',
  real_leaderboard: 'The public daily leaderboard page.',
  benchmark_comparisons: 'Allow the labelled benchmark field as a comparison source.',
  grades: 'Letter grades on results (never affects ranking).',
  signup_cta: 'Encourage account creation after a guest result.',
  public_round_stats: 'Per-round selection percentages inside explanations.',
  practice_replay: 'Let a player replay today’s game unranked.',
  archive: 'Public archive of past games.',
  sharing: 'Spoiler-free share result.',
  daily_countdown: 'Countdown to the next daily game.',
  benchmark_population: 'Benchmark population model enabled.',
  simulated_data: 'Include simulated QA rows in public/admin data. Development only.',
};

export default async function FlagsPage() {
  const flags = await getFlags();
  const keys = Object.keys(FLAG_DEFAULTS);

  return (
    <div>
      <h1 className="admin-title">Feature flags</h1>
      <p className="label">
        Launch small, expose features as traffic grows. Toggles take effect immediately.
      </p>

      <table className="table">
        <thead>
          <tr>
            <th scope="col">Flag</th>
            <th scope="col">What it does</th>
            <th scope="col">State</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const flag = flags[key];
            const enabled = flag?.enabled ?? FLAG_DEFAULTS[key as keyof typeof FLAG_DEFAULTS];
            return (
              <tr key={key}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>{key}</td>
                <td>{DESCRIPTIONS[key] ?? flag?.description ?? '—'}</td>
                <td>
                  <span className="pill" data-tone={enabled ? 'live' : 'draft'}>
                    {enabled ? 'on' : 'off'}
                  </span>
                </td>
                <td>
                  <form action={toggleFlagAction}>
                    <input type="hidden" name="key" value={key} />
                    <input type="hidden" name="enabled" value={String(!enabled)} />
                    <button type="submit" className="action--quiet">
                      Turn {enabled ? 'off' : 'on'}
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="label">
        Comparison mode, sample thresholds and the benchmark field are configured on the{' '}
        <a href="/admin/comparisons">Comparisons</a> screen.
      </p>
    </div>
  );
}
