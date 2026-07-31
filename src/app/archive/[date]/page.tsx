import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { GameClient } from '@/components/GameClient';
import { gameLabel } from '@/lib/brand';
import { getArchiveGameByDate, gameSummary, listArchiveGames } from '@/lib/games';
import { flagEnabled } from '@/lib/flags';
import { getIdentity } from '@/lib/auth';
import { logEvent } from '@/lib/analytics';
import { formatGameDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({
  params,
}: {
  params: { date: string };
}): Promise<Metadata> {
  if (!DATE_PATTERN.test(params.date)) return { title: 'Puzzle not found' };
  const game = await getArchiveGameByDate(params.date).catch(() => null);
  if (!game) return { title: 'Puzzle not found' };
  return {
    title: `Perkul ${gameLabel(game.game_number)} — ${formatGameDate(game.active_date)}`,
    description: `Play the Perkul puzzle from ${formatGameDate(game.active_date)} for fun. Ten rounds, unranked, free.`,
  };
}

/**
 * ARCHIVE PLAY. Same game, same ten rounds, same clock — but unranked.
 *
 * The heavy lifting is unchanged: GameClient already posts the gameId it was
 * given, and startAttempt recognises a published past day and forces the attempt
 * to unranked. So this page is mostly a wrapper that makes the "for fun" framing
 * unmistakable before the player presses start.
 *
 * A date that is today, in the future, or unpublished 404s — getArchiveGameByDate
 * enforces that, so this URL can't be used to read a puzzle early.
 */
export default async function ArchiveGamePage({ params }: { params: { date: string } }) {
  if (!DATE_PATTERN.test(params.date)) notFound();

  const game = await getArchiveGameByDate(params.date);
  if (!game) notFound();

  const [signupCta, sharingEnabled] = await Promise.all([
    flagEnabled('signup_cta'),
    flagEnabled('sharing'),
  ]);

  const identity = await getIdentity();

  await logEvent({
    name: 'game_view',
    userId: identity.userId,
    sessionId: identity.anonId,
    gameId: game.id,
    metadata: { gameNumber: game.game_number, source: 'archive' },
  });

  // Neighbouring days, so finishing one archive game leads straight into another.
  const all = await listArchiveGames();
  const index = all.findIndex((g) => g.activeDate === game.active_date);
  const newer = index > 0 ? all[index - 1] : null;
  const older = index >= 0 && index < all.length - 1 ? all[index + 1] : null;

  return (
    <div className="shell shell--narrow">
      <div className="dateline">
        <span>{gameLabel(game.game_number)}</span>
        <span>{formatGameDate(game.active_date)}</span>
      </div>

      {/* Set expectations before the clock starts, not after. */}
      <div className="notice" style={{ marginBottom: '1.5rem' }}>
        <strong>Archive game — just for fun.</strong> This puzzle is from{' '}
        {formatGameDate(game.active_date)}. It will not be added to the leaderboard and will not
        affect your streak, but it does count in your statistics. Play it as many times as you like.
      </div>

      <GameClient
        game={gameSummary(game)}
        initialAttempt={null}
        initialResult={null}
        showSignupCta={signupCta}
        sharingEnabled={sharingEnabled}
      />

      <div className="toolbar" style={{ marginTop: '2.5rem' }}>
        {newer ? (
          <Link className="action action--ghost" href={`/archive/${newer.activeDate}`}>
            Newer: #{newer.gameNumber}
          </Link>
        ) : null}
        {older ? (
          <Link className="action action--ghost" href={`/archive/${older.activeDate}`}>
            Older: #{older.gameNumber}
          </Link>
        ) : null}
        <Link className="action--quiet" href="/archive">
          All past games
        </Link>
        <Link className="action--quiet" href="/">
          Today&apos;s ranked game
        </Link>
      </div>
    </div>
  );
}
