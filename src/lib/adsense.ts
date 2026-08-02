/**
 * Google AdSense publisher identity, in one place.
 *
 * Two files need this number and they need it to agree: the loader tag and the
 * ownership meta tag in `src/app/layout.tsx`, and `/ads.txt`, which Google
 * fetches to confirm that this domain has authorised this publisher to sell its
 * inventory. A typo in either one reads to Google as "this site is not yours".
 *
 * Overridable so a preview deployment can run without claiming the real
 * publisher account.
 */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-3524846850046440';

/**
 * ads.txt wants the bare `pub-…` form, while the loader and the meta tag want
 * the `ca-pub-…` form. Same account, two spellings — derive one from the other
 * rather than storing the digits twice.
 */
export const ADSENSE_PUBLISHER_ID = ADSENSE_CLIENT.replace(/^ca-/, '');
