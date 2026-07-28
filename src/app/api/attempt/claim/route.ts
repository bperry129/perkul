import { claimAnonymousAttempts } from '@/lib/attempts';
import { getSessionUser } from '@/lib/supabase/server';
import { readAnonSessionId } from '@/lib/session';
import { fail, json } from '@/lib/api';
import { logEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

/**
 * Claim a guest result after signing up.
 *
 * The anonymous session id comes from the signed httpOnly cookie, never from the
 * request body, so nobody can claim someone else's attempt by guessing an id.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return fail('You need to be signed in to save a score.', 'unauthenticated', 401);

  const anonId = readAnonSessionId();
  const { claimed } = await claimAnonymousAttempts(user.id, anonId);

  if (claimed > 0) {
    await logEvent({ name: 'signup_after_result', userId: user.id, sessionId: anonId });
  }

  return json({ ok: true, claimed });
}
