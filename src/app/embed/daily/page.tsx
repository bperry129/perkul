import type { Metadata } from 'next';
import { GameClient } from '@/components/GameClient';
import { BRAND, siteUrl } from '@/lib/brand';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { getTodaysGame, gameSummary } from '@/lib/games';
import { findAttemptForIdentity, getActiveAttempt } from '@/lib/attempts';
import { getIdentity } from '@/lib/auth';
import { findPublisher } from '@/lib/publisher-cache';

export const dynamic = 'force-dynamic';

// Never indexed: this is someone else's page wearing our widget, and it has
// no content of its own worth ranking — /for-publishers is the page that
// wants to show up in search, not this one.
export const metadata: Metadata = {
  title: `${BRAND.name} widget`,
  robots: { index: false, follow: false },
};

/**
 * `/embed/daily?k=<publisher key>`
 *
 * middleware.ts has already decided, before this ever renders, whether the
 * *browser* is allowed to display this page in a frame at all — that is the
 * `Content-Security-Policy: frame-ancestors` header, computed from the same
 * key. This component makes the *second* decision, which CSP cannot make for
 * us: whether the key is worth rendering a game behind at all. The two can
 * legitimately disagree — a publisher testing the URL directly in a browser
 * tab (no ancestor to restrict) sails straight past frame-ancestors and lands
 * here, key and all, so an unauthorised key still has to be refused here too.
 *
 * `findPublisher` (the request-cached version) rather than `lookupPublisher`:
 * this render and the identical lookup already done in middleware.ts are two
 * different requests as far as React's cache is concerned (middleware and the
 * page do not share a request scope), so there is no meaningful caching being
 * lost by not reusing that one — this just avoids a second read within this
 * same render if anything downstream ever needs the publisher row too.
 */
export default async function EmbedDailyPage({
  searchParams,
}: {
  searchParams?: { k?: string };
}) {
  const key = searchParams?.k ?? null;
  const publisher = await findPublisher(key);

  const wordmark = (
    <a
      className="embed-wordmark"
      href={siteUrl('/')}
      target="_blank"
      rel="noopener noreferrer"
    >
      {BRAND.name}
    </a>
  );

  if (!key || !publisher) {
    return (
      <div className="embed-shell embed-shell--blocked">
        {wordmark}
        <p className="embed-empty">
          This {BRAND.name} widget is not set up for this site yet.
        </p>
      </div>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="embed-shell embed-shell--blocked">
        {wordmark}
        <p className="embed-empty">{BRAND.name} is temporarily unavailable.</p>
      </div>
    );
  }

  const game = await getTodaysGame();
  if (!game) {
    return (
      <div className="embed-shell embed-shell--blocked">
        {wordmark}
        <p className="embed-empty">No puzzle is live right now — check back soon.</p>
      </div>
    );
  }

  const summary = gameSummary(game);
  const identity = await getIdentity();

  // Same mid-game / already-played resume logic the homepage uses, just
  // without any of the homepage's own chrome (challenge banner, "as seen on",
  // the SEO copy block) — none of it belongs inside someone else's page.
  const existing = await findAttemptForIdentity(game.id, identity);
  const active =
    existing?.completion_status === 'in_progress' ? await getActiveAttempt(identity) : null;

  let initialResult = null;
  if (existing && existing.completion_status === 'completed') {
    const { buildAttemptResult } = await import('@/lib/attempts');
    initialResult = await buildAttemptResult(existing.id, identity);
  }

  return (
    <div className="embed-shell">
      {wordmark}
      <GameClient
        game={summary}
        initialAttempt={active}
        initialResult={initialResult}
        showSignupCta
        sharingEnabled={false}
        embed={{ key }}
      />
    </div>
  );
}
