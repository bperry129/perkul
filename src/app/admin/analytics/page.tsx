import { getAccuracyHistogram, getEventCounts, getRoundAnalytics } from '@/lib/admin-analytics';
import { getTodaysGameSummary } from '@/lib/games';
import { getDailyStats } from '@/lib/leaderboard';
import { formatElapsed } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** A single row of an inline bar chart made of a rule — no chart library. */
function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        height: 6,
        width: `${Math.max(width, value > 0 ? 2 : 0)}%`,
        background: 'var(--ink)',
        verticalAlign: 'middle',
      }}
    />
  );
}

export default async function AnalyticsPage() {
  const game = await getTodaysGameSummary();
  const [rounds, events, stats, histogram] = await Promise.all([
    getRoundAnalytics(8),
    getEventCounts(7),
    game ? getDailyStats(game.gameId) : Promise.resolve(null),
    game ? getAccuracyHistogram(game.gameId) : Promise.resolve([]),
  ]);

  const maxBucket = Math.max(1, ...histogram.map((h) => h.count));
  const maxEvent = Math.max(1, ...events.map((e) => e.count));
  const perfectShare =
    stats && stats.completions > 0 ? (stats.perfectGames / stats.completions) * 100 : null;

  return (
    <div>
      <h1 className="admin-title">Analytics</h1>
      <p className="label">
        Legitimate first ranked attempts only. Practice runs and invalid attempts are excluded;
        simulated rows appear only when the simulated-data flag is on.
      </p>

      <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
        Today
      </h2>
      <div className="admin-grid">
        <div>
          <div className="stat__value">{stats?.completions ?? 0}</div>
          <span className="stat__label">Completions</span>
        </div>
        <div>
          <div className="stat__value">{stats?.avgCorrect?.toFixed(2) ?? '—'}</div>
          <span className="stat__label">Average accuracy</span>
        </div>
        <div>
          <div className="stat__value">
            {stats?.medianElapsedMs ? formatElapsed(stats.medianElapsedMs) : '—'}
          </div>
          <span className="stat__label">Median time</span>
        </div>
        <div>
          <div className="stat__value">{perfectShare != null ? `${perfectShare.toFixed(1)}%` : '—'}</div>
          <span className="stat__label">Perfect games</span>
        </div>
        <div>
          <div className="stat__value">{stats?.registered ?? 0}</div>
          <span className="stat__label">Registered</span>
        </div>
        <div>
          <div className="stat__value">{stats?.anonymous ?? 0}</div>
          <span className="stat__label">Anonymous</span>
        </div>
      </div>

      <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
        Accuracy distribution (today)
      </h2>
      <table className="table">
        <tbody>
          {histogram.map((bucket) => (
            <tr key={bucket.correct}>
              <td style={{ width: '4rem', fontFamily: 'var(--mono)' }}>{bucket.correct}/10</td>
              <td style={{ width: '4rem' }}>{bucket.count}</td>
              <td>
                <Bar value={bucket.count} max={maxBucket} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
        Round difficulty ranking
      </h2>
      <p className="label">
        Hardest first. Under 25% correct or over 95% correct is flagged for editorial attention.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Game</th>
            <th scope="col">Round</th>
            <th scope="col">Fake</th>
            <th scope="col">Correct</th>
            <th scope="col">Most chosen wrong</th>
            <th scope="col">n</th>
            <th scope="col">Flag</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((row) => (
            <tr key={`${row.gameNumber}-${row.roundPosition}`}>
              <td style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>{row.activeDate}</td>
              <td>#{row.gameNumber}</td>
              <td>{row.roundPosition}</td>
              <td style={{ fontFamily: 'var(--serif)' }}>{row.fakeWord}</td>
              <td>{row.correctPercent}%</td>
              <td>
                {row.decoyWord ?? '—'}
                {row.decoyPercent != null ? ` · ${row.decoyPercent}%` : ''}
              </td>
              <td>{row.sampleSize}</td>
              <td>
                {row.flag ? (
                  <span className="pill" data-tone="live">
                    {row.flag.replace('_', ' ')}
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
          {rounds.length === 0 ? (
            <tr>
              <td colSpan={8}>No round data yet. Play a game or generate simulated attempts.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
        Product events (7 days)
      </h2>
      <table className="table">
        <tbody>
          {events.map((event) => (
            <tr key={event.name}>
              <td style={{ width: '14rem' }}>{event.name}</td>
              <td style={{ width: '5rem' }}>{event.count}</td>
              <td>
                <Bar value={event.count} max={maxEvent} />
              </td>
            </tr>
          ))}
          {events.length === 0 ? (
            <tr>
              <td>No events recorded yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
