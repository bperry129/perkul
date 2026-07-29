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
          {/*
            A plain <a>, not a <Link>, on purpose.
            
            The standings are live data, and a client-side <Link> navigation
            renders them from an RSC payload that Next/Vercel is free to reuse.
            In production that payload was observed serving a stale board (8
            players) on every first click, on fresh devices with empty caches,
            while a full page load of the same URL always returned the correct
            505. prefetch={false} did not help. A real document navigation is
            the one path proven to render current data every time, and the cost
            — one page load per visit to a once-a-day page — is irrelevant here.
          */}
          <a href="/leaderboard">Leaderboard</a>
          <Link href="/how-to-play">How to play</Link>
          {profile ? <Link href="/stats">Stats</Link> : null}
          {profile?.is_admin ? <Link href="/admin">Admin</Link> : null}
          <Link href={profile ? '/profile' : '/login'}>{profile ? 'Account' : 'Sign in'}</Link>
        </nav>
      </div>
    </header>
  );
}
