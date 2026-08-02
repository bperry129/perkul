import { claimAnonymousAttempts } from '@/lib/attempts';
import { getSessionUser } from '@/lib/supabase/server';
import { readAnonSessionId, verifyClaimToken } from '@/lib/session';
import { fail, json, readJson } from '@/lib/api';
import { logEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

/**
 * Claim a guest result after signing up.
 *
 * The anonymous session id normally comes from the signed httpOnly cookie,
 * never from the request body, so nobody can claim someone else's attempt by
 * guessing an id. `anonToken` is the one deliberate exception, and it is not
 * really an exception to that rule so much as a different transport for the
 * same signed value: it is how the *embed's* popup sign-in flow reaches this
 * endpoint at all, since the popup is a first-party perkul.com tab with its
 * own ordinary cookie jar and cannot see the CHIPS-partitioned anon cookie
 * that exists only inside the publisher's iframe (see the comment on
 * `signClaimToken` in `src/lib/session.ts`). It is verified and expiring, so
 * it carries the same guarantee a cookie would — just over a URL instead of a
 * header.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail('You need to be signed in to save a score.', 'unauthenticated', 401);

  const body = await readJson<{ anonToken?: string }>(request);
  const anonId = readAnonSessionId() ?? verifyClaimToken(body?.anonToken);
  const { claimed } = await claimAnonymousAttempts(user.id, anonId);

  if (claimed > 0) {
    await logEvent({ name: 'signup_after_result', userId: user.id, sessionId: anonId });
  }

  return json({ ok: true, claimed });
}
