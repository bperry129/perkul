import { startAttempt } from '@/lib/attempts';
import { attachAnonCookie, fail, json, readJson, resolveIdentity } from '@/lib/api';
import { logEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

/**
 * START. This is the moment the clock begins, and it begins on the server.
 * The response carries the words and this attempt's shuffled option order —
 * and nothing that reveals which one is fabricated.
 */
export async function POST(request: Request) {
  const body = await readJson<{ gameId?: string; practice?: boolean }>(request);
  const { identity, freshAnonId } = await resolveIdentity();

  // When the client explicitly requests a practice replay (already played today),
  // honour it unconditionally — no feature flag needed.
  const outcome = await startAttempt(identity, {
    gameId: body?.gameId ?? null,
    allowPractice: body?.practice === true ? true : undefined,
  });

  if (!outcome.ok) {
    return attachAnonCookie(fail(outcome.message, outcome.code, outcome.code === 'no_game' ? 404 : 409), freshAnonId);
  }

  await logEvent({
    name: 'game_start',
    userId: identity.userId,
    sessionId: identity.anonId ?? freshAnonId,
    gameId: outcome.payload.game.gameId,
    attemptId: outcome.payload.attemptId,
    metadata: { gameNumber: outcome.payload.game.gameNumber },
  });

  return attachAnonCookie(json({ ok: true, attempt: outcome.payload }), freshAnonId);
}
