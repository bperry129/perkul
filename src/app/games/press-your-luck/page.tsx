import Link from 'next/link';
import type { Metadata } from 'next';
import { resolveIdentity } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { getLeaderboard, getMyBest } from '@/lib/press-your-luck';
import { MAX_BUST_CHANCE, oddsTable } from '@/lib/press-your-luck-math';
import { PressYourLuckGame } from '@/components/PressYourLuckGame';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Press Your Luck',
  description:
    'A one-button push-your-luck arcade game. Every press raises your score by one and the chance it all resets by one percentage point — capped at 85%, never a sure thing.',
  alternates: { canonical: '/games/press-your-luck' },
};

export default async function PressYourLuckPage() {
  const configured = isSupabaseConfigured();

  let leaderboard: Awaited<ReturnType<typeof getLeaderboard>> = [];
  let myBest: Awaited<ReturnType<typeof getMyBest>> = null;

  if (configured) {
    const { identity } = await resolveIdentity();
    [leaderboard, myBest] = await Promise.all([getLeaderboard(25), getMyBest(identity)]);
  }

  const odds = oddsTable();

  return (
    <div className="shell shell--narrow">
      <div className="dateline">
        <span>More games</span>
        <span>Press Your Luck</span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.5rem)' }}>
        How far can you push it?
      </h1>
      <p className="standfirst">
        One button. Every press adds 1 to your score — and adds 1 percentage point to the chance
        the <em>next</em> press resets you to zero. The odds never reach certainty; they cap at{' '}
        {MAX_BUST_CHANCE}%. Bank your score any time, or keep pressing.
      </p>

      <PressYourLuckGame myBestScore={myBest?.score ?? null} />

      <h2 style={{ marginTop: '2.6rem', fontSize: '1.3rem' }}>The odds</h2>
      <p style={{ color: 'var(--ink-soft)' }}>
        The chance your next press busts the run always equals your current score, in percent, up
        to the {MAX_BUST_CHANCE}% cap. Here is how likely a run is to ever reach each score, if you
        never bank early:
      </p>
      <table className="board" style={{ marginTop: '1rem' }}>
        <thead>
          <tr>
            <th scope="col">Score</th>
            <th scope="col">Bust chance, next press</th>
            <th scope="col">Chance a run gets this far</th>
          </tr>
        </thead>
        <tbody>
          {odds.map((row) => (
            <tr key={row.score}>
              <td>{row.score}</td>
              <td>{row.bustChance}%</td>
              <td>{row.reachChancePercent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="stat__label" style={{ marginTop: '0.7rem' }}>
        On average, a run that never banks early lasts about 12 presses.
      </p>

      <h2 style={{ marginTop: '2.6rem', fontSize: '1.3rem' }}>Leaderboard</h2>
      <p className="standfirst">
        Best run per player, all time. Sign in to put your name on it — guests show as
        &quot;Guest&quot;.
      </p>

      {leaderboard.length ? (
        <table className="board">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Player</th>
              <th scope="col">Best score</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row) => (
              <tr key={row.rank}>
                <td>{row.rank}</td>
                <td className="board__name">{row.displayName}</td>
                <td className="board__score">{row.score.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="notice notice--quiet">No runs yet. Be the first on the board.</div>
      )}

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        <Link className="action--quiet" href="/games">
          More games
        </Link>
      </div>
    </div>
  );
}
