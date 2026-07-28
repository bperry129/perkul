import { logEvent } from '@/lib/analytics';
import { json, readJson, resolveIdentity } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** First-party analytics sink. Unknown event names and unsafe keys are dropped. */
export async function POST(request: Request) {
  const body = await readJson<{
    name?: string;
    gameId?: string;
    attemptId?: string;
    metadata?: unknown;
  }>(request);

  if (!body?.name) return json({ ok: true });

  const { identity } = await resolveIdentity();
  await logEvent({
    name: body.name,
    userId: identity.userId,
    sessionId: identity.anonId,
    gameId: body.gameId ?? null,
    attemptId: body.attemptId ?? null,
    metadata: body.metadata,
  });

  return json({ ok: true });
}
