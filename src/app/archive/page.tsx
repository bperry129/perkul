import Link from 'next/link';
import type { Metadata } from 'next';
import { listArchiveGames } from '@/lib/games';
import { getIdentity } from '@/lib/auth';
import { getSessionUser } from '@/lib/supabase/server';
import { getPlayerHistory } from '@/lib/attempts';
import { formatGameDate, formatGameDateShort } from '@/lib/time';
import { padGameNumber } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Puzzle Archive — Play Every Past Perkul Game',
  description:
    'Play any past Perkul puzzle for fun. Every daily game ever published, free and unranked — a new one joins the archive every midnight.',
  // The apex and www both answer for every page. Naming the canonical form here
  // means a crawler is never left to guess which of the two is the real one.
  alternates: { canonical: '/archive' },
  openGraph: {

    title: 'Perkul Puzzle Archive — Play Every Past Game',
    description:
      'Missed a day? Play any previous Perkul puzzle for fun. Unranked, unlimited, free.',
  },
};

/**
 * THE ARCHIVE.
 *
 * Every published day that is not today, newest first. These games are for fun:
 * they never touch the leaderboard, they can be replayed as often as you like,
 * and they exist so that finishing today's puzzle isn't the end of the visit.
 *
 * Signed-in players get a "played" marker per game — the small nudge that turns
 * a list into a collection worth completing.
 */
export default async function ArchivePage() {
  const games = await listArchiveGames();

  // "Played" markers are per-account. Guests still get the full list.
  const user = await getSessionUser().catch(() => null);
  const playedDates = new Set<string>();
  if (user) {
    const history = await getPlayerHistory(user.id, 400).catch(() => []);
    for (const row of history) playedDates.add(row.activeDate);
  }

  // Touch identity so an anonymous visitor has a session before they start.
  await getIdentity().catch(() => null);

  return (
    <div className="shell shell--narrow">
      <div className="dateline">
        <span>The archive</span>
        <span>{games.length} past games</span>
      </div>

      <h1 className="lede">Play any day you like.</h1>

      <p className="standfirst">
        Every Perkul puzzle ever published, newest first. Archive games are{' '}
        <strong>just for fun</strong>: they are never added to the leaderboard and never affect your
        streak, but they do count in your own statistics. Replay them as often as you want.
      </p>

      {games.length === 0 ? (
        <p className="standfirst" style={{ marginTop: '2rem' }}>
          The archive is empty for now — today is the first game. Come back tomorrow and yesterday&apos;s
          puzzle will be waiting here. <Link href="/">Play today&apos;s game</Link>.
        </p>
      ) : (
        <table className="board" style={{ marginTop: '2rem' }}>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Game</th>
              <th scope="col" style={{ textAlign: 'right' }}>
                Play
              </th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => {
              const played = playedDates.has(game.activeDate);
              return (
                <tr key={game.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
                    {formatGameDateShort(game.activeDate)}
                  </td>
                  <td className="board__name">
                    <Link className="board__link" href={`/archive/${game.activeDate}`}>
                      #{padGameNumber(game.gameNumber)}
                    </Link>
                    {played ? <span className="label"> · played</span> : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link
                      className="action--quiet"
                      href={`/archive/${game.activeDate}`}
                      aria-label={`Play game number ${game.gameNumber} from ${formatGameDate(game.activeDate)}`}
                    >
                      {played ? 'Play again' : 'Play'}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        <Link className="action" href="/">
          Today&apos;s ranked game
        </Link>
        <Link className="action action--ghost" href="/leaderboard">
          Leaderboard
        </Link>
      </div>
    </div>
  );
}
