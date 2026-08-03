import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Baloo_2, Nunito, Spline_Sans_Mono } from 'next/font/google';
import './globals.css';
import { BRAND } from '@/lib/brand';
import { ADSENSE_CLIENT } from '@/lib/adsense';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { StatCounter } from '@/components/StatCounter';
import { AmbientBubbles } from '@/components/AmbientBubbles';
import { EmbedNudge } from '@/components/EmbedNudge';


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
    'google-adsense-account': ADSENSE_CLIENT,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4db588',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * `/embed/*` gets none of the site chrome below: no wordmark header (the
   * embed page supplies its own, credited and linking out — see
   * docs/widget-handoff.md), no footer, no ambient decoration, no analytics
   * pixel that was never built to run inside someone else's iframe.
   *
   * A nested `app/embed/layout.tsx` cannot express this by itself — this root
   * layout still wraps it and would render SiteHeader/SiteFooter regardless.
   * The clean fix is two independent root layouts via route groups, but that
   * requires moving every existing top-level route into a group. Reading the
   * `x-embed` request header that middleware.ts sets for this same request is
   * the one-line alternative.
   */
  const isEmbed = headers().get('x-embed') === '1';

  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      data-embed={isEmbed ? 'true' : undefined}
    >
      <head>
        {/*
          AdSense loader, verbatim in <head> as Google's instructions specify.

          A plain tag rather than `next/script`: Next emits the loader
          indirectly (a preload link plus a `__next_s` push) under every
          strategy, and the served HTML is what gets inspected. Ownership is
          proved by the `google-adsense-account` meta tag above, which needs no
          JavaScript at all; this is belt and braces, and it is the tag that
          actually serves ads later.

          Loader only — there are no ad units in the app, so players see nothing.
          Skipped for the embed: it is someone else's page, and AdSense
          ownership is proved by perkul.com's own HTML, not by every iframe
          perkul.com happens to render.
        */}
        {!isEmbed ? (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
          />
        ) : null}
      </head>
      <body>
        {!isEmbed ? (
          <>
            {/*
              Decorative circles floating in the green either side of the page. First
              in the body so it is out of the way of everything that matters; it is
              fixed and on z-index -1, so document order is irrelevant to painting.
              Wide screens only, and it hides itself during a timed round.
            */}
            <AmbientBubbles />
            <SiteHeader />
          </>
        ) : null}
        <main>{children}</main>
        {!isEmbed ? <EmbedNudge /> : null}
        {!isEmbed ? (
          <>
            <SiteFooter />

            {/*
              StatCounter (project 13338902), last in <body> as instructed. The
              component, not an inline snippet: it also counts client-side route
              changes, leaves /admin out, and avoids React preloading the counting
              pixel — which would double every figure. See src/components/StatCounter.tsx.
            */}
            <StatCounter />
          </>
        ) : null}
      </body>
    </html>
  );
}
