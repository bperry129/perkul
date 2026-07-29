import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/admin';
import { getPlayerHistory } from '@/lib/attempts';
import { computeStreaks } from '@/lib/scoring';
import { gradeFor } from '@/lib/grades';
import { formatElapsed, formatGameDateShort, nyDateString } from '@/lib/time';
import { padGameNumber } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your statistics' };

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="stat__value">{value}</div>
      <span className="stat__label">{label}</span>
    </div>
  );
}

export default async function StatsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/stats');

  const db = serviceClient();

  const { data: lifetimeData } = await db.rpc('player_lifetime_stats', { p_user_id: user.id });
  const lifetime = (Array.isArray(lifetimeData) ? lifetimeData[0] : lifetimeData) as
    | {
        games_played: number;
        perfect_games: number;
        total_correct: number;
        total_rounds: number;
        avg_elapsed_ms: number | null;
        best_perfect_ms: number | null;
      }
    | undefined;

  const history = await getPlayerHistory(user.id, 30);

  const rankedDates = history.filter((h) => h.isRanked).map((h) => h.activeDate);
  const streaks = computeStreaks(rankedDates, nyDateString());

  const accuracy =
    lifetime && Number(lifetime.total_rounds) > 0
      ? (Number(lifetime.total_correct) / Number(lifetime.total_rounds)) * 100
      : null;

  return (
    <div className="shell shell--narrow">
      <div className="dateline">
        <span>Your record</span>
        <span>Ranked attempts only</span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.7rem, 6vw, 2.3rem)' }}>
        The long game.
      </h1>

      <div className="stat-grid">
        <Stat value={String(lifetime?.games_played ?? 0)} label="Games played" />
        <Stat value={String(lifetime?.perfect_games ?? 0)} label="Perfect games" />
        <Stat value={String(streaks.current)} label="Current streak" />
        <Stat value={String(streaks.longest)} label="Longest streak" />
        <Stat value={accuracy != null ? `${accuracy.toFixed(1)}%` : '—'} label="Lifetime accuracy" />
        <Stat
          value={lifetime?.avg_elapsed_ms ? formatElapsed(Number(lifetime.avg_elapsed_ms)) : '—'}
          label="Average time"
        />
        <Stat
          value={lifetime?.best_perfect_ms ? formatElapsed(Number(lifetime.best_perfect_ms)) : '—'}
          label="Best 10/10"
        />
      </div>

      <h2 className="admin-title" style={{ fontSize: '1.3rem', marginTop: '2.5rem' }}>
        Recent games
      </h2>
      <p className="label">Pick a game to read the full result again.</p>


      {history.length === 0 ? (
        <p className="standfirst">
          Nothing here yet. <Link href="/">Play today’s game</Link> and this fills up.
        </p>
      ) : (
        <table className="board">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Game</th>
              <th scope="col">Score</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.attemptId}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
                  {formatGameDateShort(row.activeDate)}
                </td>
                {/* One link per row, on the game number: a result is a place you
                    can go back to, and this is the only obvious way in for a
                    game you played weeks ago. */}
                <td className="board__name">
                  <Link
                    className="board__link"
                    href={`/results/${row.attemptId}`}
                    aria-label={`Full result for game number ${row.gameNumber}, ${row.correctCount} of ${row.roundsTotal} correct`}
                  >
                    #{padGameNumber(row.gameNumber)}
                  </Link>
                  {!row.isRanked ? <span className="label"> · practice</span> : null}
                </td>

                <td>
                  {row.correctCount}/{row.roundsTotal}
                  <span className="label">
                    {' '}
                    {gradeFor({
                      correct: row.correctCount,
                      rounds: row.roundsTotal,
                      elapsedMs: row.elapsedMs,
                    })}
                  </span>
                </td>
                <td>{formatElapsed(row.elapsedMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        <Link className="action action--ghost" href="/profile">
          Account settings
        </Link>
      </div>
    </div>
  );
}
