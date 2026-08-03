import { recordRun } from '@/lib/press-your-luck';
import { MAX_PLAUSIBLE_SCORE } from '@/lib/press-your-luck-math';
import { attachAnonCookie, fail, json, readJson, resolveIdentity } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Records one finished Press Your Luck run — busted or banked, the client
 * decides which and the score along with it. The randomness that ends a run
 * happens client-side for a snappy, no-round-trip button; this route is not
 * a real anti-cheat boundary, just a sanity ceiling (see MAX_PLAUSIBLE_SCORE)
 * against a hand-typed request. This is a for-fun arcade minigame, not the
 * ranked daily game — see the comment on the migration for why that's fine.
 */
export async function POST(request: Request) {
  const body = await readJson<{ score?: number; endedReason?: 'bust' | 'banked' }>(request);
  const score = Number(body?.score);
  const endedReason = body?.endedReason === 'banked' ? 'banked' : 'bust';

  if (!Number.isFinite(score) || score < 0 || score > MAX_PLAUSIBLE_SCORE) {
    return fail('Invalid score.', 'bad_request', 400);
  }

  const { identity, freshAnonId } = await resolveIdentity();
  const run = await recordRun(identity, score, endedReason);

  if (!run) {
    return attachAnonCookie(fail('Could not save your run.', 'error', 500), freshAnonId);
  }

  return attachAnonCookie(json({ ok: true, score: run.score }), freshAnonId);
}
