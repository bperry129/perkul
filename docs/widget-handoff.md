# Embeddable Widget — build state

Decisions: **embedded guests are unranked; signing in makes you rankable.**
**Free to publishers, conditional on a credit link in the parent page.**

## Done

| File | What |
|---|---|
| `next.config.mjs` | `X-Frame-Options` source narrowed to `/((?!embed).*)` so `/embed/*` can be framed. Everything else still refuses framing. |
| `src/lib/session.ts` | Added `embedCookieOptions` — `SameSite=None; Secure; Partitioned`. The existing `anonCookieOptions` (`Lax`) is *not sent* in a cross-site iframe, so an embedded player would otherwise have no identity at all. |
| `supabase/migrations/20260802000000_publishers.sql` | `publishers` table (key, allowed_origins, active, attribution_ok) + `attempts.publisher_id` + partial index. RLS on, no policies — server-only. |
| `src/lib/publishers.ts` | `findPublisher`, `normalizeOrigin`, `frameAncestors`. Unknown/suspended key or empty allowlist ⇒ `frame-ancestors 'none'`. |
| `src/lib/attempts.ts` | `startAttempt` takes `embedPublisherId`; embedded **guests** get `ranked: false`; `publisher_id` recorded on insert. |

Migration is **not yet applied** — run it against Supabase before testing.

## Remaining

1. **`src/app/embed/layout.tsx`** — minimal shell, no `SiteHeader`/`SiteFooter`. Read `?k=` key, `findPublisher`, and set
   `Content-Security-Policy: frameAncestors(publisher)`. Route handlers can set headers; a layout cannot, so this likely needs
   `middleware.ts` matching `/embed/:path*` instead — decide there. Unknown key ⇒ render a "this embed is not authorised" card.
2. **`src/app/embed/daily/page.tsx`** — reuse `GameClient` with the props `src/app/page.tsx` already passes. Hardcoded
   Perkul wordmark linking to `siteUrl('/')` with `target="_blank"` in the **header** area (a footer strip can be cropped by a
   parent with `overflow:hidden`).
3. **Attempt start must pass the publisher.** `/api/attempt/start` currently never sets `embedPublisherId`. Resolve the key
   server-side from the embed request — do **not** trust a publisher id posted by the browser, or anyone can mark plays as
   someone else's inventory.
4. **`public/embed.js`** — create iframe, `postMessage` height → parent resizes (news sites break on fixed-height iframes),
   `IntersectionObserver` lazy load, `data-key` / `data-theme` attributes. Also document a bare `<iframe>` fallback: many
   news CMSs strip `<script>` from article bodies.
5. **Sign-in from inside the frame** — `window.open` popup to perkul.com (first-party, cookies work), then `postMessage` back
   and claim via the existing `/api/attempt/claim`. Never render the login form inside the iframe.
6. **`/for-publishers`** landing page + `sitemap.ts` entry. Keywords: *free games for news websites*, *embeddable word game*,
   *engagement widget for publishers*. Live demo embed of itself, copy-paste snippet, FAQ + `FAQPage` JSON-LD.
7. **`/admin/publishers`** to mint keys, and the attribution crawler that flips `attribution_ok`.

## Two things not to forget

- **An in-iframe link is not an SEO backlink.** Google attributes framed content to `perkul.com`, so it is a self-link. The
  backlink is the credit line in the *parent* page, which is why `attribution_ok` exists and why the snippet ships with it.
- **`simulated_data` is on**, seeding 200–500 fake players per game. Defensible on our own site; a real reputational problem
  once newsrooms are embedding a leaderboard we call public. Disclose it or turn it off before the first publisher goes live.
