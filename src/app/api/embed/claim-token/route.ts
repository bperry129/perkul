import { readAnonSessionId, signClaimToken } from '@/lib/session';
import { json } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Mints the short-lived token the embed's popup sign-in flow carries to
 * perkul.com — see the long comment on `signClaimToken` in `src/lib/session.ts`
 * for why a token has to exist at all instead of just relying on a cookie.
 *
 * Read-only and side-effect free on purpose: this must be safe to call
 * speculatively (e.g. the instant the results screen mounts, before the
 * player has even looked at the sign-up CTA) without minting a fresh guest
 * identity that never gets used. `readAnonSessionId()` only decodes an
 * existing cookie; it never creates one.
 */
export async function GET() {
  const anonId = readAnonSessionId();
  if (!anonId) return json({ ok: true, token: null });
  return json({ ok: true, token: signClaimToken(anonId) });
}
