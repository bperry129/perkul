import Link from 'next/link';
import { listGameBank, getRunway } from '@/lib/games';
import { formatGameDate } from '@/lib/time';
import { padGameNumber } from '@/lib/brand';
import { publishAllNeedsReviewAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function GameBankPage() {
  const [rows, runway] = await Promise.all([listGameBank(), getRunway()]);
  const needsReviewCount = rows.filter((row) => row.status === 'needs_review').length;

  return (
    <div>
      <h1 className="admin-title">Game bank</h1>
      <p className="label">
        {rows.length} games · runway {runway.runwayDays} days · next unused date{' '}
        {formatGameDate(runway.nextUnusedDate)}
      </p>

      <div className="toolbar">
        <Link className="action action--ghost" href="/admin/games/generate">
          Generate next bank prompt
        </Link>
        {needsReviewCount > 0 ? (
          <form action={publishAllNeedsReviewAction} style={{ display: 'inline' }}>
            <button
              type="submit"
              className="action"
              style={{ background: '#b45309', borderColor: '#b45309' }}
              title="Publishes every needs_review game as-is, ignoring validator errors. Use after you've reviewed the import and are okay with any flagged issues (e.g. reused words)."
            >
              Publish all {needsReviewCount} needs_review games
            </button>
          </form>
        ) : null}
      </div>


      <table className="table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Game</th>
            <th scope="col">Status</th>
            <th scope="col">Rounds</th>
            <th scope="col">Approved</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}>{row.active_date}</td>
              <td>#{padGameNumber(row.game_number)}</td>
              <td>
                <span className="pill" data-tone={row.derived}>
                  {row.derived}
                </span>
              </td>
              <td className={row.round_count === 10 ? '' : 'issue'} data-level={row.round_count === 10 ? undefined : 'error'}>
                {row.round_count}/10
              </td>
              <td>
                {row.approved_rounds}/{row.round_count}
              </td>
              <td>
                <Link href={`/admin/games/${row.id}`}>Edit →</Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>
                No games yet. Run <code>npm run seed</code> or import a generated bank.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
