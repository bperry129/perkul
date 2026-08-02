import Link from 'next/link';
import type { Metadata } from 'next';
import { ArchiveNudge } from '@/components/ArchiveNudge';
import { AsSeenOn } from '@/components/AsSeenOn';
import { GameClient } from '@/components/GameClient';
import { Countdown } from '@/components/Countdown';
import { BRAND, gameLabel } from '@/lib/brand';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { getTodaysGame, gameSummary, listArchiveGames, probeDatabase } from '@/lib/games';
import { findAttemptForIdentity, getActiveAttempt, getChallengeInfo } from '@/lib/attempts';
import { getIdentity } from '@/lib/auth';
import { flagEnabled } from '@/lib/flags';
import { formatPoints, perkulScore } from '@/lib/scoring';
import {
  addDays,
  formatElapsed,
  formatGameDate,
  formatSeconds,
  nyDateString,
  nyMidnightInstant,
} from '@/lib/time';

import { logEvent } from '@/lib/analytics';

const DEFAULT_METADATA: Metadata = {
  title: 'Perkul — Free Daily Word Puzzle Game',
  description:
    'Play Perkul: the free daily word puzzle game where one word in every round is fake. Ten competitive rounds, a live leaderboard, and a new puzzle every day. Better than Wordle.',
  /**
   * State the front page's own address explicitly.
   *
   * Two reasons. The apex and `www` both answer, so without this the homepage
   * has two spellings and no opinion about which one is real. And every
   * challenge link is `/?c=<attemptId>` — a distinct URL per player per day,
   * all of them serving the same puzzle. Left alone that is an unbounded set of
   * near-duplicate pages for a crawler to wade through; pointing them all at
   * `/` collapses them back into one.
   */
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Perkul — Free Daily Word Puzzle Game',
    description:
      'Five words per round. One is fake. Ten rounds, live leaderboard, new puzzle every day. Free to play.',
    // A page-level `openGraph` replaces the root layout's wholesale rather than
    // merging into it, so `url` has to be restated here or the homepage ships
    // without an og:url at all.
    url: `https://${BRAND.domain}`,
  },
};


/**
 * Challenge links (/?c=<attemptId>) need their own share preview — otherwise
 * every link unfurls as the generic homepage card and the person receiving it
 * has no idea a score is waiting for them. The static /opengraph-image used
 * everywhere else can't see the query string, so this builds a one-off
 * openGraph/twitter image via /api/og with the score baked into the URL.
 * Falls back to the default metadata for a plain visit or an unknown/expired
 * challenge id.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: { c?: string };
}): Promise<Metadata> {
  const challengeId = searchParams?.c ?? null;
  const challenge = challengeId ? await getChallengeInfo(challengeId).catch(() => null) : null;
  if (!challenge) return DEFAULT_METADATA;

  const title = `${challenge.displayName} scored ${formatPoints(challenge.score)} on Perkul`;
  const description = `${challenge.correctCount}/10 correct in ${formatSeconds(challenge.elapsedMs)}s — think you can beat them? Play today's Perkul.`;
  const ogImage = `/api/og?name=${encodeURIComponent(challenge.displayName)}&score=${challenge.score}&correct=${challenge.correctCount}&total=10&elapsed=${challenge.elapsedMs}`;

  return {
    ...DEFAULT_METADATA,
    title,
    description,
    openGraph: {
      ...DEFAULT_METADATA.openGraph,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}


/** Structured data for Google — served with every page load. */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `https://${BRAND.domain}/#website`,
      url: `https://${BRAND.domain}`,
      name: BRAND.name,
      description: BRAND.tagline,
      potentialAction: {
        '@type': 'PlayAction',
        target: `https://${BRAND.domain}/`,
      },
    },
    {
      '@type': 'WebApplication',
      '@id': `https://${BRAND.domain}/#app`,
      name: BRAND.name,
      url: `https://${BRAND.domain}`,
      description:
        'A free daily competitive word puzzle game. Every round shows five words — one is fake. Ten rounds, live leaderboard, new puzzle every day.',
      applicationCategory: 'GameApplication',
      operatingSystem: 'Web',
      browserRequirements: 'Requires JavaScript',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      genre: ['Word Game', 'Puzzle', 'Daily Game'],
    },
  ],
};

export const dynamic = 'force-dynamic';

/**
 * The homepage IS today's game. No marketing gate, no account wall: a first
 * time visitor understands the premise and can press start immediately.
 *
 * Once you have finished today's game the homepage becomes a short landing —
 * what you scored, when the next game unlocks, where to go next — and the full
 * result lives at its own permanent URL (`/results/[attemptId]`). Before, the
 * homepage rendered the entire results page forever, so pressing the wordmark
 * or "home" appeared to do nothing and there was no way back to the front page.
 */

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { c?: string };
}) {
  // Challenge banner — when someone arrives via a challenge link.
  const challengeId = searchParams?.c ?? null;
  const challenge = challengeId ? await getChallengeInfo(challengeId).catch(() => null) : null;

  if (!isSupabaseConfigured()) {
    return (
      <div className="shell shell--narrow">
        <h1 className="lede">Almost there.</h1>
        <div className="notice">
          {BRAND.name} is not connected to Supabase yet. Copy <code>.env.example</code> to{' '}
          <code>.env.local</code>, add your project URL, anon key and service role key, run the
          migration and then <code>npm run seed</code>.
        </div>
      </div>
    );
  }

  const today = nyDateString();
  const nextMidnight = nyMidnightInstant(addDays(today, 1)).toISOString();
  const game = await getTodaysGame();

  if (!game) {
    // Distinguish a setup problem from a genuinely unpublished day.
    const probe = await probeDatabase();
    if (!probe.ok) {
      return (
        <div className="shell shell--narrow">
          <h1 className="lede">Almost there.</h1>
          <div className="notice">
            {probe.reason === 'schema_missing' ? (
              <>
                Connected to Supabase, but the {BRAND.name} tables do not exist yet. Run the
                migration in <code>supabase/migrations/</code>, then <code>npm run seed</code> to
                load the 20-day game bank.
              </>
            ) : (
              <>
                {BRAND.name} cannot reach its database. Check{' '}
                <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> in{' '}
                <code>.env.local</code>, then restart the dev server.
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="shell shell--narrow">
        <div className="dateline">
          <span>{formatGameDate(today)}</span>
          <span>New York</span>
        </div>
        <h1 className="lede">No puzzle today.</h1>
        <p className="standfirst">
          Today's game has not been published. This is on us, not you - try again shortly, or read
          the word policy while you wait.
        </p>
        <div className="toolbar">
          <Link className="action action--ghost" href="/word-policy">
            Word policy
          </Link>
        </div>
        <Countdown targetIso={nextMidnight} />
      </div>
    );
  }

  const identity = await getIdentity();
  const summary = gameSummary(game);

  const [signupCta, sharingEnabled, countdownEnabled] = await Promise.all([
    flagEnabled('signup_cta'),
    flagEnabled('sharing'),
    flagEnabled('daily_countdown'),
  ]);

  const existing = await findAttemptForIdentity(game.id, identity);

  // Already finished today. Show where you stand and where to go next, and keep
  // the full breakdown one click away at its own URL. Deliberately cheap: the
  // score is recomputed from the attempt row with the same perkulScore() the
  // ladder sorts on, so this does not assemble every round's answer data just to
  // say "you scored 8,520".
  if (existing && existing.completion_status === 'completed') {
    await logEvent({
      name: 'game_view',
      userId: identity.userId,
      sessionId: identity.anonId,
      gameId: game.id,
      metadata: { gameNumber: game.game_number, source: 'played_today' },
    });

    const correct = existing.correct_count ?? 0;
    const elapsedMs = existing.elapsed_ms ?? 0;
    const onTheBoard = existing.is_ranked && existing.integrity_status === 'valid';
    const archiveCount = (await listArchiveGames()).length;

    return (
      <>
        <div className="shell shell--narrow">
        <div className="dateline">
          <span>{gameLabel(game.game_number)}</span>
          <span>{formatGameDate(game.active_date)}</span>
        </div>

        <h1 className="lede">
          You've played <em>today's game</em>.
        </h1>

        <p className="standfirst">
          {correct}/{existing.rounds_total} in {formatElapsed(elapsedMs)} —{' '}
          <strong>{formatPoints(perkulScore(correct, elapsedMs))} points</strong>.{' '}
          {onTheBoard
            ? "Your score is on today's leaderboard. One ranked game a day; the next one unlocks at midnight New York."
            : 'That run was unranked, so it is not on the public leaderboard. The next ranked game unlocks at midnight New York.'}
        </p>

        {/* The whole point of the archive: "come back tomorrow" is a poor answer
            to someone who wants to keep playing right now. Given a bit of motion
            because this is the one message on the page worth interrupting for. */}
        <ArchiveNudge cta="Browse all past puzzles →">
          <strong>Not done playing?</strong> There{' '}
          {archiveCount === 1 ? 'is' : 'are'}{' '}
          <strong>{archiveCount > 0 ? archiveCount : 'more'}</strong> past{' '}
          {archiveCount === 1 ? 'puzzle' : 'puzzles'} you can play right now, just for fun — they
          never affect the leaderboard or your streak, but they do count in your statistics.
        </ArchiveNudge>

        <div className="toolbar" style={{ marginTop: '1.6rem' }}>
          <Link className="action" href="/archive">
            Play a past puzzle
          </Link>
          <Link className="action action--ghost" href={`/results/${existing.id}`}>
            See my full result
          </Link>
          {/* Plain <a>: a client-side navigation can be served a cached RSC
              payload of the board, and this one is live data. */}
          <a className="action--quiet" href="/leaderboard">
            Today's leaderboard
          </a>
          <Link className="action--quiet" href="/stats">
            Your statistics
          </Link>
        </div>

        {countdownEnabled ? <Countdown targetIso={nextMidnight} /> : null}
        </div>

        {/* Outside the card, on the green. */}
        <AsSeenOn />
        <div className="embed-nudge">
          <Link href="/for-publishers">Embed this game on your website →</Link>
        </div>
      </>
    );
  }




  // Mid-game refresh: restore the attempt with its original server start time.
  const active = existing?.completion_status === 'in_progress' ? await getActiveAttempt(identity) : null;

  await logEvent({
    name: 'game_view',
    userId: identity.userId,
    sessionId: identity.anonId,
    gameId: game.id,
    metadata: { gameNumber: game.game_number, source: active ? 'resume' : 'intro' },
  });

  return (
    <>
      {/* Challenge banner — shown when someone arrives via a friend's challenge link. */}
      {challenge ? (
        <div
          style={{
            background: 'var(--panel)',
            borderBottom: '2px solid var(--brand)',
            padding: '1rem 0',
          }}
        >
          <div className="shell" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>🏆</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontWeight: 800,
                  fontSize: 'clamp(1rem, 3.5vw, 1.2rem)',
                  color: '#fff',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                <span style={{ color: 'var(--brand)' }}>{challenge.displayName}</span>
                {' '}challenged you to beat{' '}
                <span style={{ color: 'var(--yellow)' }}>{formatPoints(challenge.score)}</span>
                {' '}— {challenge.correctCount}/10 in {formatElapsed(challenge.elapsedMs)}
              </p>
              <p style={{ color: 'var(--gray-light)', fontSize: '0.82rem', margin: '0.2rem 0 0' }}>
                Play today&apos;s game and see if you can top their score on the leaderboard.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="shell shell--narrow">
        <GameClient
          game={summary}
          initialAttempt={active}
          initialResult={null}
          showSignupCta={signupCta}
          sharingEnabled={sharingEnabled}
        />
        {!active ? (
          <div
            className="dateline"
            style={{ borderTop: '1px solid var(--rule)', marginTop: '3rem' }}
          >
            <span>{gameLabel(game.game_number)}</span>
            <span>{formatGameDate(game.active_date)}</span>
          </div>
        ) : null}
      </div>

      {/* Press credentials sit on the green, under the card — not inside the
          game surface. Skipped outright when we already know a round is in
          progress; GameClient's body[data-playing] flag covers the case where
          the player presses start without a page load. */}
      {!active ? <AsSeenOn /> : null}
      {!active ? (
        <div className="embed-nudge">
          <Link href="/for-publishers">Embed this game on your website →</Link>
        </div>
      ) : null}


      {/* JSON-LD structured data — rendered in the HTML, consumed by Google. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* SEO content section — always server-rendered so Google indexes the
          keyword-rich copy that describes what Perkul is and who it's for.
          Visually low-key (small text, footer-weight) so it does not distract
          from the game itself. */}
      {!active ? (
        <section
          className="shell"
          style={{
            paddingTop: '3rem',
            paddingBottom: '3rem',
            borderTop: '1px solid rgba(255,255,255,0.18)',
          }}
        >
          <div style={{ maxWidth: '640px', color: 'rgba(255,255,255,0.80)' }}>
            <h2
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: '#fff',
                marginBottom: '0.75rem',
                letterSpacing: '-0.01em',
              }}
            >
              What is Perkul?
            </h2>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.7, marginBottom: '1rem' }}>
              Perkul is a <strong style={{ color: '#fff' }}>free daily word puzzle game</strong>{' '}
              that challenges you to spot the fake word. Every round presents five words — four are
              real English words, one is completely fabricated. Pick the fake. Ten rounds. Fastest
              correct answers win. A new puzzle launches every day at midnight ET.
            </p>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.7, marginBottom: '1rem' }}>
              If you enjoy <strong style={{ color: '#fff' }}>games like Wordle</strong> or the NYT
              Connections puzzle, Perkul gives you a longer, harder, and more competitive challenge.
              Where Wordle is one word a day, Perkul is ten rounds of vocabulary pressure with a
              live leaderboard to settle who&apos;s actually the best.
            </p>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
              No app download required. No subscription. Works on any phone or desktop.{' '}
              <Link
                href="/how-to-play"
                style={{ color: '#fff', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.45)' }}
              >
                Learn how to play →
              </Link>
            </p>
          </div>
        </section>
      ) : null}
    </>
  );

}
