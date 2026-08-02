import { serviceClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { findPublisher, normalizeOrigin } from '@/lib/publishers';
import { fail, json, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * The embed reports where it is running — never whether attribution is
 * present. That check has to happen server-side against the real parent-page
 * HTML (see `checkAttribution` in `src/lib/attribution.ts`) or a publisher
 * could just have the iframe self-report "yes, the link is there."
 *
 * This only records a URL. `GameClient`'s embed effect calls it once per
 * mount with `document.referrer`, which a cross-origin child iframe still
 * receives from the browser on the *initial* navigation (unless the parent
 * page sends `Referrer-Policy: no-referrer`, in which case there is nothing
 * to report and this is skipped client-side).
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json({ ok: true });

  const body = await readJson<{ key?: string; pageUrl?: string }>(request);
  const key = body?.key ?? null;
  const pageUrl = body?.pageUrl ?? null;
  if (!key || !pageUrl) return fail('Missing key or pageUrl.', 'bad_request', 400);

  const publisher = await findPublisher(key);
  if (!publisher) return fail('Unknown publisher key.', 'not_found', 404);

  // The reported URL's origin must be one this publisher is actually allowed
  // to embed from — otherwise anything posting a valid key could seed
  // publisher_pages with someone else's URL and point the crawler anywhere.
  const origin = normalizeOrigin(pageUrl);
  const allowed = publisher.allowed_origins.map(normalizeOrigin).filter(Boolean);
  if (!origin || !allowed.includes(origin)) {
    return fail('Page origin is not on this publisher\'s allowlist.', 'origin_not_allowed', 403);
  }

  await serviceClient()
    .from('publisher_pages')
    .upsert(
      { publisher_id: publisher.id, url: pageUrl, last_seen_at: new Date().toISOString() },
      { onConflict: 'publisher_id,url' },
    );

  return json({ ok: true });
}
