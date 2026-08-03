import { randomUUID } from 'node:crypto';
import { recordPressActivity, recordRun } from '@/lib/press-your-luck';
import { bustChanceForScore, MAX_PLAUSIBLE_SCORE } from '@/lib/press-your-luck-math';
import { signRunToken, verifyRunToken } from '@/lib/press-your-luck-token';
import { attachAnonCookie, fail, json, readJson, resolveIdentity } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * The authoritative Press Your Luck engine. Every press — successful or
 * busting — is decided here, not in the browser.
 *
 * This game gives away a real $25 prize at a specific score, which changes
 * the security model completely from a for-fun high-score counter: the
 * random roll has to happen somewhere the player cannot see or influence it,
 * and the score has to be a fact the server established, not a number the
 * client asserts. See the comment on press-your-luck-token.ts for the fuller
 * story of why this replaced a client-side roll + "submit your score" route.
 *
 * State between presses travels as a signed token (see press-your-luck-token.ts)
 * rather than a server-side session store — no database write is needed just
 * to hold "score so far" between one press and the next, and the signature
 * makes tampering with it pointless.
 */

/** Below this gap between presses, treat the request as too fast to be a
 * real button push and ignore it without changing anything. Comfortably
 * below normal human reaction/press cadence, but enough to blunt a naive
 * autoclicker or script firing requests back-to-back. */
const MIN_INTERVAL_MS = 120;

function randomPercent(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] / 0xffffffff) * 100;
}

export async function POST(request: Request) {
  const body = await readJson<{ token?: string | null }>(request);
  const now = Date.now();
  const incoming = verifyRunToken(body?.token ?? null);

  // A token that fails verification (tampered, forged, or simply absent) is
  // never trusted with whatever score it claims — it starts a fresh run at
  // zero, exactly like a first-ever press. There is no other way for a
  // client-supplied number to affect the score.
  let score = 0;
  let nonce: string = randomUUID();

  if (incoming) {
    if (now - incoming.t < MIN_INTERVAL_MS) {
      // Too fast to be a real press. No-op: hand back the same state,
      // unchanged, rather than erroring — a slightly eager double-click
      // shouldn't feel like a bug, and a script hammering this endpoint
      // gains nothing from it either.
      return json({
        ok: true,
        busted: false,
        ignored: true,
        score: incoming.s,
        token: signRunToken(incoming),
      });
    }
    score = Math.min(incoming.s, MAX_PLAUSIBLE_SCORE);
    nonce = incoming.n;
  }

  const chance = bustChanceForScore(score);
  const busted = randomPercent() < chance;

  const { identity, freshAnonId } = await resolveIdentity();

  if (busted) {
    await recordRun(identity, score, 'bust');
    await recordPressActivity(identity, true);
    return attachAnonCookie(json({ ok: true, busted: true, score }), freshAnonId);
  }

  await recordPressActivity(identity, false);
  const nextScore = score + 1;
  const token = signRunToken({ s: nextScore, t: now, n: nonce });
  return attachAnonCookie(json({ ok: true, busted: false, score: nextScore, token }), freshAnonId);
}

// The old client-submits-a-final-score route is gone. Keeping a POST-only
// handler here (no GET) means a stray request to the old path now 405s
// instead of silently doing nothing.
export async function GET() {
  return fail('Not found.', 'not_found', 404);
}
