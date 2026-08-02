# Perkul — Developer Handoff (Context Window Refresh)

**Date:** August 1, 2026
**Repo:** https://github.com/bperry129/perkul
**Live:** https://perkul.com (Vercel, deploys on push to `main`)
**Supabase:** `qbtaiaauiweztfviznqp`
**Local path:** `C:\Users\bperr\Desktop\perkul`

---

## What Perkul is

Daily word game. 10 rounds, 5 words each, pick the fake one. New puzzle at midnight ET.
Public leaderboard (most correct, then fastest). Optional account for a persistent name.

**Stack:** Next.js 14 App Router (TypeScript, server components), Supabase (auth + Postgres + RLS), Vercel.

---

## ⛔ DO THIS FIRST — a commit is held back on purpose

```
git --no-pager log --oneline -1   →  a4aad58  (local only, 1 ahead of origin)
```

`a4aad58` is **committed but NOT pushed**, and must not be pushed until the migration runs.

`createAttempt()` in `src/lib/attempts.ts` now writes a `publisher_id` column that does not exist
in production yet. Deploy before migrating and PostgREST rejects every attempt insert — **nobody
can start a game.**

**Order of operations:**
1. Supabase SQL editor → run `supabase/migrations/20260802000000_publishers.sql`
2. Verify: `select publisher_id from attempts limit 1;` and `select * from publishers;` both work
3. `git push`
4. Confirm the deploy succeeded and a game still starts on perkul.com

---

## State of the two active workstreams

### 1. AdSense / SEO — shipped (`bf2ccf9`, live)

Rejection was diagnosed as an apex/`www` mismatch plus a missing `ads.txt`. Added `ads.txt` route,
canonical URLs on indexed pages, restored the homepage `og:url`.

**Still owed by you, not by the code:**
- Vercel → Settings → Domains → make **`perkul.com` primary** (currently `www` is). This is the root
  cause of the mismatch; the sitemap, canonicals and `og:url` all say apex.
- Search Console: submit `https://perkul.com/sitemap.xml`. Register a **Domain** property (DNS TXT at
  Namecheap, host `@`), *not* URL-prefix — a sitemap may only list URLs on the property's own host,
  and every `<loc>` is apex.
- Re-request AdSense review after the above.

### 2. Embeddable widget for news sites — foundation only

**Product decisions already made:** embedded guests play unranked; signing in makes you rankable.
Free to publishers, conditional on a credit link in their page.

**Done in `a4aad58`:**

| File | What and why |
|---|---|
| `next.config.mjs` | `X-Frame-Options` source narrowed to `/((?!embed).*)`. It was `/(.*)`, which refused all third-party framing. XFO cannot express an allowlist (`ALLOW-FROM` is dead), so `/embed/*` is excluded and defends itself with CSP instead. |
| `src/lib/session.ts` | New `embedCookieOptions` — `SameSite=None; Secure; Partitioned`. The existing `Lax` cookie is **not sent in a cross-site iframe**; without this an embedded player has no identity at all. |
| `supabase/migrations/20260802000000_publishers.sql` | `publishers` (key, `allowed_origins[]`, `active`, `attribution_ok`) + `attempts.publisher_id` + partial index. RLS on with **no policies** — server-only by design. |
| `src/lib/publishers.ts` | `findPublisher()`, `normalizeOrigin()`, `frameAncestors()`. Unknown / suspended / empty-allowlist key ⇒ `frame-ancestors 'none'`. Keys are regex-validated before hitting the DB because they get interpolated into a security header. |
| `src/lib/attempts.ts` | `startAttempt()` accepts `embedPublisherId`; embedded **guests** get `ranked: false`; `publisher_id` recorded on insert. |

`npm run typecheck` passes.

**Remaining, in build order:**

1. **CSP via `middleware.ts`** matching `/embed/:path*`. A layout *cannot* set response headers, so
   this cannot live in `src/app/embed/layout.tsx` — that was the original plan and it is wrong.
   Read `?k=`, `findPublisher()`, set `Content-Security-Policy: <frameAncestors(publisher)>`.
2. **`src/app/embed/daily/page.tsx`** — minimal shell, no `SiteHeader`/`SiteFooter`. Reuse
   `GameClient` with the props `src/app/page.tsx` already passes. Perkul wordmark linking to
   `siteUrl('/')`, `target="_blank"`, in the **header** — a footer strip can be cropped by a parent
   with `overflow:hidden`.
3. **Pass the publisher into attempt start.** `/api/attempt/start` never sets `embedPublisherId`
   yet. Resolve the key **server-side**; never trust a publisher id posted by the browser or anyone
   can bill plays to someone else's account.
4. **`public/embed.js`** — build the iframe, `postMessage` height → parent resizes (fixed-height
   iframes break on mobile news layouts), `IntersectionObserver` lazy load, `data-key` / `data-theme`.
   Also document a bare `<iframe>` fallback: WordPress / Arc / Brightspot often strip `<script>`
   from article bodies, and losing a deal to a sanitiser is avoidable.
5. **Popup sign-in.** `window.open` to perkul.com (first-party, cookies work normally), then
   `postMessage` back and claim through the existing `/api/attempt/claim`. **Never** render the login
   form inside the iframe.
6. **`/for-publishers`** landing page + `sitemap.ts` entry. Keywords: *free games for news websites*,
   *embeddable word game*, *engagement widget for publishers*, *increase time on site*. Live demo
   embed of itself, copy-paste snippet with copy button, FAQ + `FAQPage` JSON-LD.
7. **`/admin/publishers`** to mint keys, plus the crawler that checks the parent page for
   `a[href*="perkul.com"]` and flips `attribution_ok`.

---

## Two things that will bite you if forgotten

**An in-iframe link is not an SEO backlink.** Google attributes framed content to `perkul.com`, so a
link inside the widget is a self-link and passes no PageRank. The backlink is the credit line in the
*publisher's own HTML* — that is the entire reason `attribution_ok` exists and why the snippet ships
with a visible credit `<p>`. Publishers cannot restyle or DOM-hide anything inside a cross-origin
iframe, so in-frame branding is safe from tampering; cropping is the only real attack.

**`simulated_data` is ON** — 200–500 fake players seeded per game (`src/lib/simulate.ts`), all
`is_simulated = true, is_ranked = true`. Defensible on your own site. A real reputational risk once
newsrooms embed a leaderboard described as public. Disclose it or turn it off before publisher #1.

---

## Pre-existing known issues (unchanged this session)

1. **Email confirmation signup → HTTP 500.** Resend DNS not verified, so GoTrue crashes sending the
   confirmation. Immediate fix: Supabase → Auth → Providers → Email → **"Confirm email" OFF**.
   Permanent: once resend.com/domains shows `perkul.com` Verified, re-enable custom SMTP
   (`smtp.resend.com:465`, user `resend`, sender `noreply@perkul.com`) and re-enable confirmation.
2. **`leaderboard_page` RPC bug.** `p_offset > 0` with `p_include_simulated = true` returns 0 rows.
   `src/lib/leaderboard.ts` always calls `p_offset: 0, p_limit: total`. **Do not reintroduce
   pagination with a non-zero offset.**
3. **`display_name_override`** on `attempts` is not readable via PostgREST. SQL RPCs only — the
   `leaderboard_page` RPC does the `COALESCE(...)` server-side. Never direct-SELECT it from the JS client.
4. **Vercel build sensitivity.** A TS syntax error fails the build silently and the old deployment
   keeps serving. Always `npm run typecheck` before pushing.
5. `.env.local` has `NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder` intentionally; the real key lives in
   Vercel env vars.
6. Re-grant admin after re-registering: `npx tsx scripts/make-admin.ts your@email.com`

---

## Suggested first message for the new window

> Read `docs/HANDOFF.md`. I've applied the publishers migration and pushed `a4aad58`.
> Continue the widget build at step 1 (middleware CSP), then steps 2–4.
