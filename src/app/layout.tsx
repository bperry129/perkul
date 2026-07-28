import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BRAND } from '@/lib/brand';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    'A daily vocabulary game. Five words, one is fake. Ten rounds. Most right, fastest, wins.',
  applicationName: BRAND.name,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: 'Five words. One isn’t real. A new puzzle every day.',
    type: 'website',
  },
  robots: { index: true, follow: true },
  // Deliberately no puzzle content in metadata: share previews must not spoil.
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f6f3ec',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
