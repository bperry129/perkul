import { recordAnswer } from '@/lib/attempts';
import { fail, json, readJson, resolveIdentity } from '@/lib/api';
import { logEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

type Body = {
  attemptId?: string;
  roundId?: string;
  optionId?: string;
  elapsedAtMs?: number;
  roundNumber?: number;
  displayPosition?: number;
};

/**
 * A single committed selection. The response deliberately contains no hint of
 * correctness — the player learns nothing until round 10 is done.
 */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body?.attemptId || !body.roundId || !body.optionId) {
    return fail('Missing selection data.', 'bad_request', 400);
  }

  const { identity } = await resolveIdentity();
  const outcome = await recordAnswer(body.attemptId, identity, {
    roundId: body.roundId,
    optionId: body.optionId,
    elapsedAtMs: body.elapsedAtMs,
  });

  if (!outcome.ok) return fail(outcome.message, outcome.code, 409);

  await logEvent({
    name: 'round_selection',
    userId: identity.userId,
    sessionId: identity.anonId,
    attemptId: body.attemptId,
    metadata: {
      roundNumber: body.roundNumber,
      displayPosition: body.displayPosition,
      elapsedMs: body.elapsedAtMs,
    },
  });

  return json({ ok: true, answered: outcome.answered });
}
