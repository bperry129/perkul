import type { Metadata, Viewport } from 'next';
import { Baloo_2, Nunito, Spline_Sans_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { BRAND } from '@/lib/brand';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

/**
 * Type system.
 *  - Baloo 2: the display face. Warm, rounded and confident — wordmark,
 *    headlines, the game words and the big score.
 *  - Nunito: the working sans for UI copy, labels and body text.
 *  - Spline Sans Mono: timers and tabular figures (stable digit widths).
 */
const display = Baloo_2({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Nunito({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = Spline_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — Free Daily Word Puzzle Game`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    'Perkul is a free daily word puzzle game. Every round shows five words — one is completely fake. Ten rounds, a live competitive leaderboard, new puzzle every day. The best Wordle alternative for players who want more.',
  keywords: [
    'daily word game',
    'word puzzle game',
    'free word game',
    'games like Wordle',
    'Wordle alternative',
    'competitive word game',
    'daily vocabulary game',
    'fake word game',
    'word guessing game',
    'online word game',
    'word game with leaderboard',
    'new word game every day',
    'Perkul',
  ],
  applicationName: BRAND.name,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  openGraph: {
    title: `${BRAND.name} — Free Daily Word Puzzle Game`,
    description:
      'Five words per round. One is fake. Ten competitive rounds, a live leaderboard, new puzzle every day. Free to play — no account needed.',
    type: 'website',
    url: `https://${BRAND.domain}`,
    siteName: BRAND.name,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
  // Deliberately no puzzle content in metadata: share previews must not spoil.
  // AdSense ownership meta tag — statically present in HTML so the AdSense
  // crawler can verify the publisher without executing JavaScript.
  other: {
    'google-adsense-account': 'ca-pub-3524846850046440',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4db588',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      {/* Google AdSense — publisher ca-pub-3524846850046440 */}
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3524846850046440"
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        {/* StatCounter — project 13338902, perkul.com */}
        <Script id="statcounter-vars" strategy="afterInteractive">{`
          var sc_project=13338902;
          var sc_invisible=1;
          var sc_security="8069eb92";
        `}</Script>
        <Script
          src="https://www.statcounter.com/counter/counter.js"
          strategy="afterInteractive"
        />
        <noscript>
          <div className="statcounter">
            <a title="site stats" href="https://statcounter.com/" target="_blank" rel="noreferrer">
              <img
                className="statcounter"
                src="https://c.statcounter.com/13338902/0/8069eb92/1/"
                alt="site stats"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </a>
          </div>
        </noscript>
      </body>
    </html>
  );
}
