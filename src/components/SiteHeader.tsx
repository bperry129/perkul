import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { getProfile } from '@/lib/auth';

/** Public navigation is deliberately tiny. */
export async function SiteHeader() {
  const profile = await getProfile();

  return (
    <header className="shell">
      <div className="masthead">
        <Link href="/" className="masthead__brand">
          {BRAND.name.slice(0, -1)}
          <span>{BRAND.name.slice(-1)}</span>
        </Link>
        <nav className="masthead__nav" aria-label="Main">
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/how-to-play">How to play</Link>
          {profile ? <Link href="/stats">Stats</Link> : null}
          {profile?.is_admin ? <Link href="/admin">Admin</Link> : null}
          <Link href={profile ? '/profile' : '/login'}>{profile ? 'Account' : 'Sign in'}</Link>
        </nav>
      </div>
    </header>
  );
}
