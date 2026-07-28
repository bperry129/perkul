import Link from 'next/link';
import { GameClient } from '@/components/GameClient';
import { Countdown } from '@/components/Countdown';
import { BRAND, gameLabel } from '@/lib/brand';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { getTodaysGame, gameSummary, probeDatabase } from '@/lib/games';
import {
  buildAttemptResult,
  findAttemptForIdentity,
  getActiveAttempt,
} from '@/lib/attempts';
import { getIdentity } from '@/lib/auth';
import { flagEnabled } from '@/lib/flags';
import { addDays, formatGameDate, nyDateString, nyMidnightInstant } from '@/lib/time';
import { logEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

/**
 * The homepage IS today's game. No marketing gate, no account wall: a first
 * time visitor understands the premise and can press start immediately.
 *
 * Completed games render through GameClient (not a static ResultsView) so the
 * "Play again for fun" button works client-side without a page reload.
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

  // Already finished today: pass the result into GameClient so the "Play again
  // for fun" button works without a full page reload.
  if (existing && existing.completion_status === 'completed') {
    const result = await buildAttemptResult(existing.id, identity);
    if (result) {
      await logEvent({
        name: 'game_view',
        userId: identity.userId,
        sessionId: identity.anonId,
        gameId: game.id,
        metadata: { gameNumber: game.game_number, source: 'result' },
      });
      return (
        <div className="shell shell--narrow">
          <GameClient
            game={summary}
            initialAttempt={null}
            initialResult={result}
            showSignupCta={signupCta}
            sharingEnabled={sharingEnabled}
          />
          {countdownEnabled ? <Countdown targetIso={nextMidnight} /> : null}
        </div>
      );
    }
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
