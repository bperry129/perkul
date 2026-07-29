import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ResultsView } from '@/components/ResultsView';
import { buildAttemptResult } from '@/lib/attempts';
import { getIdentity } from '@/lib/auth';
import { flagEnabled } from '@/lib/flags';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * A permanent home for a finished game, so a result is a place you can go back
 * to rather than a screen you lose the moment you navigate away. Reached from
 * Recent games on /stats, and from the homepage on the day you played.
 *
 * Ownership is the whole security story: `buildAttemptResult` returns null
 * unless `ownsAttempt` matches the requester by account or anonymous session
 * cookie, and we answer 404 rather than 403 so the URL cannot be used to probe
 * which attempt ids exist. Answer data is only ever assembled for a *completed*
 * attempt the caller owns, exactly as on the play route.
 */
export const metadata: Metadata = {
  title: 'Your result',
  // Personal, and full of answers. Never index it.
  robots: { index: false, follow: false },
};

export default async function ResultPage({ params }: { params: { attemptId: string } }) {
  if (!isSupabaseConfigured()) notFound();

  const identity = await getIdentity();
  const result = await buildAttemptResult(params.attemptId, identity);
  if (!result) notFound();

  const [signupCta, sharingEnabled] = await Promise.all([
    flagEnabled('signup_cta'),
    flagEnabled('sharing'),
  ]);

  return (
    <div className="shell shell--narrow">
      <ResultsView
        result={result}
        showSignupCta={signupCta}
        sharingEnabled={sharingEnabled}
      />
    </div>
  );
}
