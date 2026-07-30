import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/admin';
import { claimAnonymousAttempts } from '@/lib/attempts';
import { readAnonSessionId } from '@/lib/session';
import { logEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

/**
 * Handles the "Confirm signup" email link.
 *
 * The old flow (`/auth/callback`, still present) expects a PKCE `code` from
 * Supabase's own /auth/v1/verify redirect and exchanges it with
 * exchangeCodeForSession(). That exchange needs the code verifier that was
 * stashed in a cookie by the *same browser* that called signUp() — so it
 * breaks the moment someone confirms on a different device/browser than they
 * signed up on, or the instant a mail client / security scanner prefetches
 * the link and burns the one-time code before the human clicks it. Both are
 * routine, not edge cases, and both were producing /login?error=auth_failed
 * here even though the account was created fine.
 *
 * This route verifies the emailed OTP directly (token_hash + type) via
 * verifyOtp(), which carries no local browser state, so it works from any
 * device the link is opened on. It requires the "Confirm signup" email
 * template in the Supabase dashboard to link here — see README §Auth.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const nextRaw = url.searchParams.get('next') || '/profile';

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL('/login?error=missing_token', url.origin));
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', url.origin));
  }

  await logEvent({ name: 'login', userId: data.user.id });

  // `next` is a full landing path/URL that may itself carry ?claim=1 — set by
  // LoginForm's redirectTo(). Falls back to /profile on anything malformed.
  let nextUrl: URL;
  try {
    nextUrl = new URL(nextRaw, url.origin);
  } catch {
    nextUrl = new URL('/profile', url.origin);
  }

  if (nextUrl.searchParams.get('claim') === '1') {
    const anonId = readAnonSessionId();
    await claimAnonymousAttempts(data.user.id, anonId);
  }

  // If the user signed up with a display name, it was stashed in
  // user_metadata at signUp() time (see LoginForm.tsx) — save it now that the
  // account is confirmed and we have a verified user id.
  const metaName = data.user.user_metadata?.display_name as string | undefined;
  if (metaName?.trim()) {
    await serviceClient()
      .from('profiles')
      .upsert(
        { user_id: data.user.id, display_name: metaName.trim(), leaderboard_opt_in: true },
        { onConflict: 'user_id' },
      );
  }

  return NextResponse.redirect(nextUrl);
}
