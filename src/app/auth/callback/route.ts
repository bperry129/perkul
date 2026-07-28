import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/admin';
import { claimAnonymousAttempts } from '@/lib/attempts';
import { readAnonSessionId } from '@/lib/session';
import { logEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

/**
 * Auth callback. Exchanges the code for a session and:
 * - Claims any anonymous attempts (if claim=1 param is set)
 * - Saves the display name from user_metadata to the profiles table
 *   (used when a user signed up with a display name but needed email confirmation)
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

  // If the user signed up with a display name, save it to their profile now.
  // This handles the email-confirmation flow where the name was passed in user_metadata.
  const metaName = data.user.user_metadata?.display_name as string | undefined;
  if (metaName?.trim()) {
    await serviceClient()
      .from('profiles')
      .upsert(
        { user_id: data.user.id, display_name: metaName.trim(), leaderboard_opt_in: true },
        { onConflict: 'user_id' },
      );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
