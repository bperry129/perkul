import { getSessionUser } from '@/lib/supabase/server';
import { setDisplayName } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { fail, json, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail('Sign in first.', 'unauthenticated', 401);

  const body = await readJson<{ displayName?: string; leaderboardOptIn?: boolean }>(request);
  if (!body) return fail('Nothing to update.', 'bad_request', 400);

  if (typeof body.displayName === 'string') {
    const outcome = await setDisplayName(user.id, body.displayName);
    if (!outcome.ok) return fail(outcome.message ?? 'Could not save that name.', 'invalid_name', 400);
  }

  if (typeof body.leaderboardOptIn === 'boolean') {
    await serviceClient()
      .from('profiles')
      .update({ leaderboard_opt_in: body.leaderboardOptIn })
      .eq('user_id', user.id);
  }

  return json({ ok: true });
}
