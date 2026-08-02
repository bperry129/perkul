import { startAttempt } from '@/lib/attempts';
import { attachAnonCookie, fail, json, readJson, resolveIdentity } from '@/lib/api';
import { findPublisher } from '@/lib/publisher-cache';
import { logEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

/**
 * START. This is the moment the clock begins, and it begins on the server.
 * The response carries the words and this attempt's shuffled option order —
 * and nothing that reveals which one is fabricated.
 *
 * `embedKey` is a publisher *key* (public, lives in other people's HTML), not
 * a publisher id. The client can only ever assert which key it is playing
 * under; which publisher that resolves to — and whether it resolves to
 * anything at all — is decided here with `findPublisher()`, never trusted
 * from the request body. That is also why the presence of the *field*, not
 * whether it resolves, decides the cookie's SameSite behaviour below: a typo'd
 * or suspended key is still a cross-site iframe request and still needs the
 * `None; Partitioned` cookie to hold a guest's session together, even though
 * the attempt itself won't be attributed to anyone.
 */
export async function POST(request: Request) {
  const body = await readJson<{ gameId?: string; practice?: boolean; embedKey?: string }>(request);
  const isEmbed = typeof body?.embedKey === 'string' && body.embedKey.length > 0;
  const { identity, freshAnonId } = await resolveIdentity();

  const publisher = isEmbed ? await findPublisher(body!.embedKey!) : null;

  // When the client explicitly requests a practice replay (already played today),
  // honour it unconditionally — no feature flag needed.
  const outcome = await startAttempt(identity, {
    gameId: body?.gameId ?? null,
    allowPractice: body?.practice === true ? true : undefined,
    embedPublisherId: publisher?.id ?? null,
  });

  if (!outcome.ok) {
    return attachAnonCookie(
      fail(outcome.message, outcome.code, outcome.code === 'no_game' ? 404 : 409),
      freshAnonId,
      isEmbed,
    );
  }

  await logEvent({
    name: 'game_start',
    userId: identity.userId,
    sessionId: identity.anonId ?? freshAnonId,
    gameId: outcome.payload.game.gameId,
    attemptId: outcome.payload.attemptId,
    metadata: { gameNumber: outcome.payload.game.gameNumber, publisherId: publisher?.id ?? null },
  });

  return attachAnonCookie(json({ ok: true, attempt: outcome.payload }), freshAnonId, isEmbed);
}
