import Link from 'next/link';
import type { Metadata } from 'next';
import { BRAND, gameLabel } from '@/lib/brand';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { getTodaysGame } from '@/lib/games';
import { getLeaderboardPage } from '@/lib/leaderboard';
import { findAttemptForIdentity } from '@/lib/attempts';
import { getIdentity } from '@/lib/auth';
import { flagEnabled } from '@/lib/flags';
import { formatElapsed, formatGameDate } from '@/lib/time';
import { logEvent } from '@/lib/analytics';
import type { LeaderboardRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Leaderboard',
  description: "Today's standings. Most right, fastest, wins.",
};

/**
 * Today · Smartest players · Total points.
 *
 * Plain anchors, not <Link>: standings are live data and a client-side
 * navigation can be served from a cached RSC payload (see SiteHeader).
 */
function BoardTabs({ current }: { current: 'today' | 'smartest' | 'points' }) {
  return (
    <nav className="tabs" aria-label="Leaderboard">
      <a className="tabs__link" href="/leaderboard" aria-current={current === 'today' ? 'page' : undefined}>
        Today
      </a>
      <a
        className="tabs__link"
        href="/leaderboard/all-time?tab=smartest"
        aria-current={current === 'smartest' ? 'page' : undefined}
      >
        Smartest players
      </a>
      <a
        className="tabs__link"
        href="/leaderboard/all-time?tab=points"
        aria-current={current === 'points' ? 'page' : undefined}
      >
        Total points
      </a>
    </nav>
  );
}

function Row({ row }: { row: LeaderboardRow }) {
  return (
    <tr data-you={row.isYou ? 'true' : undefined}>
      <td>{row.rank}</td>
      <td className="board__name">
        {row.displayName}
        {row.isYou ? <span className="label label--signal"> · you</span> : null}
      </td>
      <td className="board__score">{row.score.toLocaleString()}</td>
      <td>{row.correctCount}/10</td>
      <td>{formatElapsed(row.elapsedMs)}</td>
    </tr>
  );
}

export default async function LeaderboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="shell shell--narrow">
        <h1 className="lede">Leaderboard</h1>
        <div className="notice">Connect Supabase to see standings.</div>
      </div>
    );
  }

  const enabled = await flagEnabled('real_leaderboard');
  const game = await getTodaysGame();

  if (!enabled || !game) {
    return (
      <div className="shell shell--narrow">
        <h1 className="lede">Leaderboard</h1>
        <p className="standfirst">
          {enabled ? 'There is no live game right now.' : 'The daily leaderboard is currently off.'}
        </p>
        {enabled ? <BoardTabs current="today" /> : null}
        <Link className="action action--ghost" href="/">
          Back to today's game
        </Link>
      </div>
    );
  }

  const identity = await getIdentity();
  const mine = await findAttemptForIdentity(game.id, identity);

  // Always page=1, pageSize=10000 — the RPC is called at offset=0 so every
  // player appears on one scrollable page and there is no Next/Prev button.
  const board = await getLeaderboardPage({
    gameId: game.id,
    page: 1,
    pageSize: 10000,
    myAttemptId: mine?.completion_status === 'completed' ? mine.id : null,
  });

  await logEvent({
    name: 'leaderboard_view',
    userId: identity.userId,
    sessionId: identity.anonId,
    gameId: game.id,
    metadata: { gameNumber: game.game_number },
  });

  const showNeighbours = board.neighbours.length > 0;

  return (
    <div className="shell shell--narrow">
      <div className="dateline">
        <span>{gameLabel(game.game_number)}</span>
        <span>{formatGameDate(game.active_date)}</span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.7rem, 6vw, 2.4rem)' }}>
        Today&apos;s standings
      </h1>

      <BoardTabs current="today" />

      <p className="standfirst">
        {BRAND.rule} Every correct answer is worth 1,000 points and every second costs 8, so
        accuracy carries the day — but a game left open long enough will lose to a faster one.
      </p>

      <p className="label" style={{ marginTop: '1rem' }}>
        {board.total === 0
          ? 'No completed games yet today. Be first.'
          : `${board.total.toLocaleString()} ${board.total === 1 ? 'player' : 'players'} today`}
      </p>

      {board.total > 0 ? (
        <table className="board">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Player</th>
              <th scope="col">Score</th>
              <th scope="col">Right</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <Row key={row.attemptId} row={row} />
            ))}
            {showNeighbours ? (
              <>
                <tr className="board__gap">
                  <td colSpan={5}>· · ·</td>
                </tr>
                {board.neighbours.map((row) => (
                  <Row key={`n-${row.attemptId}`} row={row} />
                ))}
              </>
            ) : null}
          </tbody>
        </table>
      ) : null}

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        <Link className="action action--ghost" href="/">
          {mine?.completion_status === 'completed' ? 'Your result' : `Play ${BRAND.name}`}
        </Link>
        <a className="action action--quiet" href="/leaderboard/all-time">
          All-time leaderboard
        </a>
      </div>
    </div>
  );
}
