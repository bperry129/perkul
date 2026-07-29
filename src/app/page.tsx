import Link from 'next/link';
import { AsSeenOn } from '@/components/AsSeenOn';
import { GameClient } from '@/components/GameClient';
import { Countdown } from '@/components/Countdown';
import { BRAND, gameLabel } from '@/lib/brand';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { getTodaysGame, gameSummary, probeDatabase } from '@/lib/games';
import { findAttemptForIdentity, getActiveAttempt } from '@/lib/attempts';
import { getIdentity } from '@/lib/auth';
import { flagEnabled } from '@/lib/flags';
import { formatPoints, perkulScore } from '@/lib/scoring';
import {
  addDays,
  formatElapsed,
  formatGameDate,
  nyDateString,
  nyMidnightInstant,
} from '@/lib/time';
import { logEvent } from '@/lib/analytics';


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

export default async function HomePage() {
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

    return (
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

        <div className="toolbar" style={{ marginTop: '1.6rem' }}>
          <Link className="action" href={`/results/${existing.id}`}>
            See my full result
          </Link>
          {/* Plain <a>: a client-side navigation can be served a cached RSC
              payload of the board, and this one is live data. */}
          <a className="action action--ghost" href="/leaderboard">
            Today's leaderboard
          </a>
          <Link className="action--quiet" href="/stats">
            Your statistics
          </Link>
        </div>

        {countdownEnabled ? <Countdown targetIso={nextMidnight} /> : null}

        <AsSeenOn />
      </div>
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
    <div className="shell shell--narrow">
      <GameClient
        game={summary}
        initialAttempt={active}
        initialResult={null}
        showSignupCta={signupCta}
        sharingEnabled={sharingEnabled}
      />
      {!active ? (
        <div className="dateline" style={{ borderTop: '1px solid var(--rule)', marginTop: '3rem' }}>
          <span>{gameLabel(game.game_number)}</span>
          <span>{formatGameDate(game.active_date)}</span>
        </div>
      ) : null}
    </div>
  );
}
