import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ProfileForm } from '@/components/ProfileForm';
import { getProfile } from '@/lib/auth';
import { getSessionUser } from '@/lib/supabase/server';
import { formatGameDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Account' };

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/profile');
  const profile = await getProfile();

  return (
    <div className="shell shell--narrow">
      <div className="dateline">
        <span>Account</span>
        <span>{profile ? formatGameDate(profile.created_at.slice(0, 10)) : ''}</span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.7rem, 6vw, 2.3rem)' }}>
        {profile?.display_name || 'Choose a name'}
      </h1>
      <p className="standfirst">
        Your display name is the only thing other players ever see. Your email is never shown.
      </p>

      <div style={{ marginTop: '2rem' }}>
        <ProfileForm
          displayName={profile?.display_name ?? null}
          leaderboardOptIn={profile?.leaderboard_opt_in ?? true}
        />
      </div>

      <div className="toolbar" style={{ marginTop: '2.5rem' }}>
        <Link className="action action--ghost" href="/stats">
          Your statistics
        </Link>
        <Link className="action--quiet" href="/">
          Today’s game
        </Link>
      </div>
    </div>
  );
}
