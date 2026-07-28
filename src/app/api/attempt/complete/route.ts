import { completeAttempt, type SubmittedAnswer } from '@/lib/attempts';
import { fail, json, readJson, resolveIdentity } from '@/lib/api';
import { logEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

type Body = {
  attemptId?: string;
  answers?: SubmittedAnswer[];
  clientElapsedMs?: number;
};

/**
 * Completion. Authoritative elapsed time is computed here from the server start
 * timestamp; the client's number is stored only for comparison. Idempotent, so
 * the client can retry after a network drop without losing or rewriting a game.
 */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body?.attemptId || !Array.isArray(body.answers)) {
    return fail('Missing submission data.', 'bad_request', 400);
  }

  const { identity } = await resolveIdentity();
  const outcome = await completeAttempt(
    body.attemptId,
    identity,
    body.answers.slice(0, 20),
    body.clientElapsedMs,
  );

  if (!outcome.ok) {
    return fail(outcome.message, outcome.code, outcome.code === 'not_found' ? 404 : 409);
  }

  await logEvent({
    name: 'game_complete',
    userId: identity.userId,
    sessionId: identity.anonId,
    gameId: outcome.result.game.gameId,
    attemptId: outcome.result.attemptId,
    metadata: {
      correctCount: outcome.result.correctCount,
      elapsedMs: outcome.result.elapsedMs,
      gameNumber: outcome.result.game.gameNumber,
    },
  });

  return json({ ok: true, result: outcome.result });
}
