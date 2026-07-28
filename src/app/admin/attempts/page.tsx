import { listAttempts } from '@/lib/admin-analytics';
import { formatElapsed } from '@/lib/time';
import { setAttemptIntegrityAction } from '../actions';

export const dynamic = 'force-dynamic';

const STATUSES = ['valid', 'suspicious', 'unranked', 'admin_review'] as const;

export default async function AttemptsPage({
  searchParams,
}: {
  searchParams: { integrity?: string; simulated?: string };
}) {
  const rows = await listAttempts({
    integrity: searchParams.integrity || null,
    includeSimulated: searchParams.simulated === 'yes',
    limit: 150,
  });

  return (
    <div>
      <h1 className="admin-title">Attempts</h1>
      <p className="label">
        Suspicious attempts are flagged, never deleted. A flagged score is still visible privately to
        the player but stays out of public ranking until it is marked valid.
      </p>

      <form className="inline-form" method="get">
        <label className="field" style={{ maxWidth: '13rem' }}>
          <span className="field__label">Integrity</span>
          <select name="integrity" defaultValue={searchParams.integrity ?? ''}>
            <option value="">All</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ maxWidth: '13rem' }}>
          <span className="field__label">Simulated rows</span>
          <select name="simulated" defaultValue={searchParams.simulated ?? 'no'}>
            <option value="no">Hide</option>
            <option value="yes">Include</option>
          </select>
        </label>
        <button type="submit" className="action action--ghost">
          Filter
        </button>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Game</th>
            <th scope="col">Player</th>
            <th scope="col">Score</th>
            <th scope="col">Time</th>
            <th scope="col">Ranked</th>
            <th scope="col">Integrity</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>
                {row.activeDate ?? '—'}
              </td>
              <td>#{row.gameNumber ?? '—'}</td>
              <td>
                {row.displayName}
                {row.isSimulated ? <span className="pill">simulated</span> : null}
              </td>
              <td>{row.correctCount != null ? `${row.correctCount}/10` : 'in progress'}</td>
              <td>{row.elapsedMs != null ? formatElapsed(row.elapsedMs) : '—'}</td>
              <td>{row.isRanked ? 'yes' : 'no'}</td>
              <td>
                <span className="pill">{row.integrityStatus}</span>
                {row.notes ? <div className="label">{row.notes}</div> : null}
              </td>
              <td>
                <form action={setAttemptIntegrityAction} className="inline-form">
                  <input type="hidden" name="attemptId" value={row.id} />
                  <select name="integrityStatus" defaultValue={row.integrityStatus}>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <select name="isRanked" defaultValue={String(row.isRanked)}>
                    <option value="true">ranked</option>
                    <option value="false">unranked</option>
                  </select>
                  <button type="submit" className="action--quiet">
                    Apply
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8}>No attempts match this filter.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
