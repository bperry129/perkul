import Link from 'next/link';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { FindMeButton } from '@/components/FindMeButton';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

import {
  getAllTimeLeaderboard,
  MIN_GAMES_FOR_AVERAGE,
  type AllTimeBoard,
  type AllTimeRow,
} from '@/lib/all-time';
import { getIdentity } from '@/lib/auth';
import { flagEnabled } from '@/lib/flags';
import { logEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'All-time leaderboard',
  description:
    'Smartest players by average score, and the biggest all-time points totals. Most right, fastest, wins.',
};

/**
 * Two ways to be the best at Perkul, on two tabs:
 *
 *  - **Smartest Players** (default) — average score per game, so a player who
 *    only shows up twice a week but scores well is recognised instead of being
 *    buried by whoever plays the most. A 5-game minimum keeps it honest, and
 *    that minimum is stated on the page rather than hidden in the maths.
 *  - **Total Points** — everything accumulated across every game played.
 */
type Tab = 'smartest' | 'points';

const TABS: Array<{ id: Tab; label: string; href: string }> = [
  { id: 'smartest', label: 'Smartest players', href: '/leaderboard/all-time?tab=smartest' },
  { id: 'points', label: 'Total points', href: '/leaderboard/all-time?tab=points' },
];

function parseTab(value: string | string[] | undefined): Tab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'points' ? 'points' : 'smartest';
}

const whole = (n: number) => Math.round(n).toLocaleString('en-US');
const oneDecimal = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Plain anchors, not <Link>: these boards are live data, and a client-side
 * navigation can be served from a cached RSC payload. Same reasoning as the
 * Leaderboard link in SiteHeader.
 */
function BoardTabs({ current }: { current: Tab }) {
  return (
    <nav className="tabs" aria-label="Leaderboard">
      <a className="tabs__link" href="/leaderboard">
        Today
      </a>
      {TABS.map((t) => (
        <a
          key={t.id}
          className="tabs__link"
          href={t.href}
          aria-current={t.id === current ? 'page' : undefined}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}

function Row({ row, tab }: { row: AllTimeRow; tab: Tab }) {
  return (
    <tr data-you={row.isYou ? 'true' : undefined}>
      <td>{row.rank}</td>
      <td className="board__name">
        {row.displayName}
        {row.isYou ? <span className="label label--signal"> · you</span> : null}
      </td>
      {tab === 'smartest' ? (
        <>
          <td className="board__score">{oneDecimal(row.averageScore)}</td>
          <td>{row.gamesPlayed}</td>
          <td>{whole(row.totalScore)}</td>
        </>
      ) : (
        <>
          <td className="board__score">{whole(row.totalScore)}</td>
          <td>{row.gamesPlayed}</td>
          <td>{oneDecimal(row.averageScore)}</td>
        </>
      )}
    </tr>
  );
}

export default async function AllTimeLeaderboardPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const tab = parseTab(searchParams?.tab);

  if (!isSupabaseConfigured()) {
    return (
      <div className="shell shell--narrow">
        <h1 className="lede">All-time leaderboard</h1>
        <div className="notice">Connect Supabase to see standings.</div>
      </div>
    );
  }

  const enabled = await flagEnabled('real_leaderboard');
  if (!enabled) {
    return (
      <div className="shell shell--narrow">
        <h1 className="lede">All-time leaderboard</h1>
        <p className="standfirst">Leaderboards are currently off.</p>
        <Link className="action action--ghost" href="/">
          Back to today&apos;s game
        </Link>
      </div>
    );
  }

  const identity = await getIdentity();

  // Fail soft. A standings page is not worth a whole-page server exception:
  // if the aggregate cannot be read, say so and keep the navigation working.
  let board: AllTimeBoard | null = null;
  try {
    board = await getAllTimeLeaderboard({
      metric: tab === 'points' ? 'total' : 'average',
      limit: 250,
      identity,
    });
  } catch (error) {
    console.error('[all-time] could not build the board', error);
  }

  if (!board) {
    return (
      <div className="shell shell--narrow">
        <h1 className="lede">All-time leaderboard</h1>
        <BoardTabs current={tab} />
        <div className="notice">
          All-time standings could not be loaded just now. Today&apos;s board is still live.
        </div>
        <div className="toolbar">
          <Link className="action action--ghost" href="/">
            Play {BRAND.name}
          </Link>
          <a className="action action--quiet" href="/leaderboard">
            Today&apos;s standings
          </a>
        </div>
      </div>
    );
  }

  await logEvent({
    name: 'leaderboard_view',
    userId: identity.userId,
    sessionId: identity.anonId,
    metadata: { source: `all_time_${tab}` },
  });

  const needsMore =
    tab === 'smartest' &&
    !board.you &&
    board.yourGamesPlayed > 0 &&
    board.yourGamesPlayed < MIN_GAMES_FOR_AVERAGE;

  // Only offer "Find me" when the player actually has a row to jump to. On this
  // board that is either a qualifying row in the top 250 or the appended
  // "your position" row below the gap.
  const youOnBoard = Boolean(board.you) || board.rows.some((row) => row.isYou);


  return (
    <div className="shell shell--narrow">
      <div className="dateline">
        <span>All time</span>
        <span>
          {board.gamesCounted.toLocaleString()} {board.gamesCounted === 1 ? 'game' : 'games'} counted
        </span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.7rem, 6vw, 2.4rem)' }}>
        {tab === 'smartest' ? 'Smartest players' : 'Most points, all time'}
      </h1>

      <BoardTabs current={tab} />

      <p className="standfirst">
        {tab === 'smartest' ? (
          <>
            Ranked by <strong>average score per game</strong>, so playing every day is not what puts
            you on top — playing well is. You do not have to show up daily to be recognised here.
          </>
        ) : (
          <>
            Ranked by <strong>every point ever earned</strong>, added up across all games played.
            Showing up matters on this one.
          </>
        )}
      </p>

      {tab === 'smartest' ? (
        <div className="notice notice--quiet">
          <strong>Minimum {MIN_GAMES_FOR_AVERAGE} games to qualify.</strong> A high average from one
          lucky game is not a record, so players appear here only once they have completed{' '}
          {MIN_GAMES_FOR_AVERAGE} or more games.
        </div>
      ) : null}

      <div className="board__bar">
        <p className="label" style={{ margin: 0 }}>
          {board.totalPlayers === 0
            ? tab === 'smartest'
              ? `No one has completed ${MIN_GAMES_FOR_AVERAGE} games yet. Be first.`
              : 'No completed games yet. Be first.'
            : `${board.totalPlayers.toLocaleString()} ${
                board.totalPlayers === 1 ? 'player qualifies' : 'players qualify'
              }`}
        </p>
        {youOnBoard ? <FindMeButton label="Find me" /> : null}
      </div>


      {board.totalPlayers > 0 ? (
        <table className="board">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Player</th>
              <th scope="col">{tab === 'smartest' ? 'Avg score' : 'Total points'}</th>
              <th scope="col">Games</th>
              <th scope="col">{tab === 'smartest' ? 'Total points' : 'Avg score'}</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <Row key={row.playerKey} row={row} tab={tab} />
            ))}
            {board.you && !board.rows.some((r) => r.playerKey === board.you?.playerKey) ? (
              <>
                <tr className="board__gap">
                  <td colSpan={5}>· · ·</td>
                </tr>
                <Row row={board.you} tab={tab} />
              </>
            ) : null}
          </tbody>
        </table>
      ) : null}

      {needsMore ? (
        <p className="label" style={{ marginTop: '1rem' }}>
          You have completed {board.yourGamesPlayed} of {MIN_GAMES_FOR_AVERAGE} games needed to
          qualify for this board.
        </p>
      ) : null}

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        <Link className="action action--ghost" href="/">
          Play {BRAND.name}
        </Link>
        <a className="action action--quiet" href="/leaderboard">
          Today&apos;s standings
        </a>
      </div>
    </div>
  );
}
