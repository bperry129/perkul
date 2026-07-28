import Link from 'next/link';
import { BRAND } from '@/lib/brand';

export function SiteFooter() {
  return (
    <footer className="shell">
      <div className="colophon">
        <span>
          {BRAND.name} · {new Date().getFullYear()}
        </span>
        <Link href="/how-to-play">How to Play</Link>
        <Link href="/word-policy">Word Policy</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </div>
    </footer>
  );
}
