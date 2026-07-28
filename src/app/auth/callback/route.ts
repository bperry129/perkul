import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { claimAnonymousAttempts } from '@/lib/attempts';
import { readAnonSessionId } from '@/lib/session';
import { logEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

/**
 * Auth callback. Exchanges the code for a session and — if the visitor was
 * playing as a guest — claims their anonymous attempts server-side using the
 * signed cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/profile';
  const claim = url.searchParams.get('claim') === '1';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', url.origin));
  }

  await logEvent({ name: 'login', userId: data.user.id });

  if (claim) {
    const anonId = readAnonSessionId();
    await claimAnonymousAttempts(data.user.id, anonId);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
