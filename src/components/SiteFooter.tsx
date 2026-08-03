import Link from 'next/link';
import { BRAND } from '@/lib/brand';

/**
 * The footer is the only contact point on the site, so the address is a real
 * `mailto:` rather than a contact form nobody maintains. It reads `BRAND.email`,
 * the same constant Terms and Privacy use — those pages promise a reply at that
 * address, and three hard-coded copies is how such a promise quietly breaks.
 */
export function SiteFooter() {
  return (
    <footer className="shell">
      <div className="colophon">
        <span>
          {BRAND.name} · {new Date().getFullYear()}
        </span>
        <Link href="/archive">Past Puzzles</Link>
        <Link href="/how-to-play">How to Play</Link>
        <Link href="/games">More Games</Link>
        <Link href="/word-policy">Word Policy</Link>
        <Link href="/for-publishers">For Publishers</Link>
        <Link href="/privacy">Privacy</Link>

        <Link href="/terms">Terms</Link>
        <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
      </div>
    </footer>
  );
}
