import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { BRAND } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

const NAV = [
  ['/admin', 'Dashboard'],
  ['/admin/games', 'Game bank'],
  ['/admin/games/generate', 'Create games'],
  ['/admin/lexicon', 'Lexicon'],
  ['/admin/players', 'Players'],
  ['/admin/attempts', 'Attempts'],
  ['/admin/archive-plays', 'Archive plays'],
  ['/admin/analytics', 'Analytics'],
  ['/admin/comparisons', 'Comparisons'],
  ['/admin/dummy-players', 'Dummy Players'],
  ['/admin/flags', 'Feature flags'],
  ['/admin/publishers', 'Publishers'],
  ['/admin/settings', 'Settings'],
] as const;


export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Server-side authorization. Not "the link is hidden".
  const profile = await requireAdmin();

  return (
    <div className="admin-shell">
      <div className="dateline">
        <span>
          {BRAND.name} operations · {profile.display_name ?? 'admin'}
        </span>
        <Link href="/">View site →</Link>
      </div>
      <nav className="admin-nav" aria-label="Admin">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
