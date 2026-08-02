import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { LoginForm } from '@/components/LoginForm';
import { getSessionUser } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; claim?: string; anonToken?: string; popup?: string };
}) {
  const user = await getSessionUser();
  // A signed-in popup still has to run its claim + postMessage + close
  // sequence — redirecting here (the normal, non-popup behaviour) would leave
  // an already-signed-in publisher reader stuck in a popup with no way back
  // to the game. LoginForm handles that branch itself.
  if (user && !(searchParams.popup === '1')) redirect(searchParams.next || '/profile');

  const claim = searchParams.claim === '1';
  const isPopup = searchParams.popup === '1';

  return (
    <div className="shell shell--narrow">
      <div className="dateline">
        <span>Account</span>
        <span>Optional, always</span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.4rem)' }}>
        {claim ? 'Save your score.' : `Sign in to ${BRAND.name}.`}
      </h1>
      <p className="standfirst">
        {claim
          ? 'Create a free account to save your score to the leaderboard, build a streak and track your history across devices.'
          : 'Sign in or create a free account. Accounts let you appear on the leaderboard, track your streak and carry your history across devices.'}
      </p>

      {isSupabaseConfigured() ? (
        <div style={{ marginTop: '2rem' }}>
          <LoginForm
            next={searchParams.next || '/profile'}
            claim={claim}
            anonToken={searchParams.anonToken}
            popup={isPopup}
            alreadySignedIn={Boolean(user)}
          />
        </div>
      ) : (
        <div className="notice">Authentication is not configured in this environment yet.</div>
      )}

      {!isPopup ? (
        <p className="label" style={{ marginTop: '2rem' }}>
          <Link href="/">Back to today's game</Link>
        </p>
      ) : null}
    </div>
  );
}
