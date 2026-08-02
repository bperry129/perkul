import { ADSENSE_PUBLISHER_ID } from '@/lib/adsense';

/**
 * /ads.txt — the IAB authorised-sellers file.
 *
 * Google fetches this from the root of the domain to confirm that this site has
 * authorised this publisher account to sell its ad inventory. Until it exists
 * AdSense reports the site as unauthorised or unavailable, which is easy to
 * misread as a hosting problem: the file was simply a 404.
 *
 * A route rather than `public/ads.txt` so the publisher ID has exactly one
 * definition (`src/lib/adsense.ts`) shared with the loader and the ownership
 * meta tag in the root layout. `f08c47fec0942fa0` is Google's own certification
 * authority ID and is the same for every AdSense publisher.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  const body = `google.com, ${ADSENSE_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0\n`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Google re-reads this occasionally; a day is plenty and keeps a stale
      // publisher ID from being cached for a week if it ever changes.
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
