import { getPressYourLuckAnalytics } from '@/lib/press-your-luck-admin';
import { formatElapsed } from '@/lib/time';

export const dynamic = 'force-dynamic';

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return `${formatElapsed(ms)} ago`;
}

export default async function PressYourLuckAdminPage() {
  const { totals, players } = await getPressYourLuckAnalytics();

  return (
    <div>
      <h1 className="admin-title">Press Your Luck — activity</h1>
      <p className="label">
        One row per player. &quot;Max hours/day&quot; is the widest spread of distinct hours (out
        of 24) any single day of presses covered — a real person playing an arcade game for a few
        minutes sets a handful of these; a script left running around the clock sets nearly all of
        them. 18+ is flagged for a manual look.
      </p>

      <div className="admin-grid">
        <div>
          <div className="stat__value">{totals.players}</div>
          <span className="stat__label">Players</span>
        </div>
        <div>
          <div className="stat__value">{totals.runs.toLocaleString()}</div>
          <span className="stat__label">Total runs</span>
        </div>
        <div>
          <div className="stat__value">{totals.presses.toLocaleString()}</div>
          <span className="stat__label">Total presses</span>
        </div>
        <div>
          <div className="stat__value">{totals.flagged}</div>
          <span className="stat__label">Flagged for review</span>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Kind</th>
            <th scope="col">Runs</th>
            <th scope="col">Presses</th>
            <th scope="col">Best score</th>
            <th scope="col">Max hours/day</th>
            <th scope="col">Last press</th>
            <th scope="col">Flag</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.identityKey}>
              <td>
                {p.displayName}
                <br />
                <span className="label" style={{ fontWeight: 500, letterSpacing: 0 }}>
                  {p.userId ?? p.anonymousSessionId}
                </span>
              </td>
              <td>{p.isRegistered ? 'Registered' : 'Guest'}</td>
              <td>{p.totalRuns.toLocaleString()}</td>
              <td>{p.totalPresses.toLocaleString()}</td>
              <td>{p.bestScore}</td>
              <td>{p.maxHoursInADay} / 24</td>
              <td>{timeAgo(p.lastPressAt)}</td>
              <td>
                {p.flagged ? (
                  <span className="pill" data-tone="live">
                    review
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
          {players.length === 0 ? (
            <tr>
              <td colSpan={8}>No activity recorded yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
