'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * StatCounter, rendered last in <body>.
 *
 * Two details this needs that the pasted snippet does not handle.
 *
 * 1. **Client-side navigation.** Perkul is an App Router site and most movement
 *    (leaderboard, stats, a result) is a `Link` navigation with no page load, so
 *    `counter.js` would run once and every later page would go uncounted. The
 *    first view is logged by the script as normal; after that a route change
 *    fires StatCounter's own 1×1 endpoint — the same URL as the `<noscript>`
 *    fallback below — so a session reads as the several pages it actually was.
 *    The initial pathname is deliberately skipped so it is never counted twice.
 *
 * 2. **Admin is not traffic.** `/admin` is a handful of internal page views that
 *    would otherwise sit in the same numbers as real players. It is excluded, so
 *    running the game does not inflate its own statistics.
 *
 * The config vars are a plain inline <script> rather than `next/script`, so they
 * are present in the server-rendered HTML and cannot lose a race with
 * `counter.js`, which is fetched afterwards.
 *
 * The `<noscript>` markup is injected as a string on purpose. Written as JSX,
 * React sees an `<img>` it can be helpful about and emits
 * `<link rel="preload" as="image">` for it in <head> — which *fetches the
 * counting pixel on every JS-enabled page load*, on top of the `counter.js`
 * hit, quietly doubling every figure. As raw HTML there is no element for React
 * to preload, and the pixel stays what it is meant to be: the no-JS fallback.
 */


const PROJECT = '13338902';
const SECURITY = '8069eb92';

/** StatCounter's pixel — invisible counter, so nothing is drawn. */
const PIXEL = `https://c.statcounter.com/${PROJECT}/0/${SECURITY}/1/`;

export function StatCounter() {
  const pathname = usePathname();
  const countedFirstView = useRef(false);
  const isAdmin = pathname?.startsWith('/admin') ?? false;

  useEffect(() => {
    // counter.js already logged whichever page was loaded first.
    if (!countedFirstView.current) {
      countedFirstView.current = true;
      return;
    }
    if (isAdmin) return;

    const pixel = new Image();
    pixel.referrerPolicy = 'no-referrer-when-downgrade';
    // Cache-busted, or the browser would serve one hit for the whole session.
    pixel.src = `${PIXEL}?${Date.now()}`;
  }, [pathname, isAdmin]);

  if (isAdmin) return null;

  return (
    <>
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `var sc_project=${PROJECT};var sc_invisible=1;var sc_security="${SECURITY}";`,
        }}
      />
      <Script src="https://www.statcounter.com/counter/counter.js" strategy="afterInteractive" />
      <noscript
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html:
            `<div class="statcounter">` +
            `<a title="Web Analytics Made Easy - Statcounter" href="https://statcounter.com/" target="_blank" rel="noreferrer">` +
            `<img class="statcounter" src="${PIXEL}" alt="Web Analytics Made Easy - Statcounter" referrerpolicy="no-referrer-when-downgrade">` +
            `</a></div>`,
        }}
      />

    </>
  );
}
