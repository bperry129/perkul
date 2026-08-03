import Link from 'next/link';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'More games',
  description: `A small arcade of extra, unranked games alongside the daily ${BRAND.name} puzzle.`,
  alternates: { canonical: '/games' },
};

const GAMES = [
  {
    href: '/games/press-your-luck',
    title: 'Press Your Luck',
    tagline:
      'One button. Every press raises your score by one — and raises the chance it all resets to zero.',
  },
];

export default function GamesHubPage() {
  return (
    <div className="shell shell--narrow">
      <div className="dateline">
        <span>More games</span>
        <span>{BRAND.name}</span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.5rem)' }}>
        A few extra games
      </h1>
      <p className="standfirst">
        Just for fun — these are separate from the daily {BRAND.name} puzzle and don&apos;t affect
        your streak or the main leaderboard.
      </p>

      <div className="game-cards">
        {GAMES.map((game) => (
          <Link key={game.href} href={game.href} className="game-card">
            <h2 className="game-card__title">{game.title}</h2>
            <p className="game-card__tagline">{game.tagline}</p>
            <span className="game-card__cta">Play →</span>
          </Link>
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        <Link className="action--quiet" href="/">
          Back to {BRAND.name}
        </Link>
      </div>
    </div>
  );
}
