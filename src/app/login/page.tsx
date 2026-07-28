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
  searchParams: { next?: string; claim?: string };
}) {
  const user = await getSessionUser();
  if (user) redirect(searchParams.next || '/profile');

  const claim = searchParams.claim === '1';

  return (
    <div className="shell shell--narrow">
      <div className="dateline">
        <span>Account</span>
        <span>Optional, always</span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.4rem)' }}>
        {claim ? 'Save your result.' : `Sign in to ${BRAND.name}.`}
      </h1>
      <p className="standfirst">
        {claim
          ? 'Create a free account and today’s score, streak and history come with you.'
          : 'Accounts exist for history, streaks, personal records and a leaderboard name. You never need one to play.'}
      </p>

      {isSupabaseConfigured() ? (
        <div style={{ marginTop: '2rem' }}>
          <LoginForm next={searchParams.next || '/profile'} claim={claim} />
        </div>
      ) : (
        <div className="notice">Authentication is not configured in this environment yet.</div>
      )}

      <p className="label" style={{ marginTop: '2rem' }}>
        <Link href="/">Back to today’s game</Link>
      </p>
    </div>
  );
}
