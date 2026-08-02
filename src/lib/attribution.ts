import 'server-only';
import { serviceClient } from './supabase/admin';

/**
 * The attribution crawler.
 *
 * The credit link in the copy-paste snippet is the entire backlink deal (see
 * the long comment in docs/HANDOFF.md on why an in-iframe link is not one),
 * and it is one paragraph of HTML a publisher can delete at any time. The
 * only enforcement that means anything is periodically re-fetching the real
 * page and checking the raw HTML for a link to perkul.com — never trusting
 * anything the embed itself reports, since that would just move the same
 * problem one hop over.
 *
 * A grace period rather than an instant cutoff: a CMS re-render, a CDN cache
 * miss, or a temporary 500 on the publisher's site is not the same thing as
 * a publisher who removed the link on purpose, and an embed that blinks off
 * because of a transient fetch failure is a support ticket, not a policy
 * enforcement.
 */

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // one week

/** True if the raw HTML contains an anchor pointing at perkul.com. */
export function htmlHasAttribution(html: string): boolean {
  // Deliberately loose: any <a ... href="...perkul.com...") counts, on any
  // path. We are checking for the presence of a courtesy link, not auditing
  // its exact wording or placement.
  return /<a\b[^>]*href=["'][^"']*perkul\.com[^"']*["'][^>]*>/i.test(html);
}

export type PageCheckResult = {
  url: string;
  ok: boolean;
  found: boolean | null; // null = fetch itself failed, not a content verdict
  error?: string;
};

/** Fetch one page and look for the credit link. Never throws. */
export async function checkPage(url: string): Promise<PageCheckResult> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      // A generic browser UA: some CMSs serve a stripped-down page to
      // anything that looks like a bot, which would produce false negatives.
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; PerkulAttributionCheck/1.0)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { url, ok: false, found: null, error: `HTTP ${response.status}` };
    }
    const html = await response.text();
    return { url, ok: true, found: htmlHasAttribution(html) };
  } catch (error) {
    return { url, ok: false, found: null, error: error instanceof Error ? error.message : 'fetch failed' };
  }
}

export type PublisherAttributionSummary = {
  publisherId: string;
  pagesChecked: number;
  pagesWithAttribution: number;
  attributionOk: boolean;
  graceUntil: string | null;
};

/**
 * Check every known page for one publisher and decide the publisher-level
 * verdict from the results.
 *
 * The rule: attribution is fine if at least one known page still carries the
 * link (a publisher with ten articles and one missing paragraph is not the
 * problem this exists to catch) or if every check that ran failed to even
 * load the page (fetch failures are our infrastructure's problem, not
 * grounds to accuse anyone). It only starts the grace clock when we
 * successfully fetched at least one page and found the link on none of them.
 */
export async function checkAttributionForPublisher(
  publisherId: string,
): Promise<PublisherAttributionSummary> {
  const db = serviceClient();

  const { data: pageRows } = await db
    .from('publisher_pages')
    .select('id, url')
    .eq('publisher_id', publisherId);
  const pages = (pageRows ?? []) as Array<{ id: string; url: string }>;

  const { data: publisherRow } = await db
    .from('publishers')
    .select('id, attribution_grace_until')
    .eq('id', publisherId)
    .maybeSingle();
  const publisher = publisherRow as { id: string; attribution_grace_until: string | null } | null;

  if (!pages.length) {
    // Nothing reported yet. Nothing to fail on either — leave whatever
    // verdict already exists alone rather than manufacturing a false one.
    return {
      publisherId,
      pagesChecked: 0,
      pagesWithAttribution: 0,
      attributionOk: true,
      graceUntil: publisher?.attribution_grace_until ?? null,
    };
  }

  const results = await Promise.all(pages.map((p) => checkPage(p.url)));

  const now = new Date();
  await Promise.all(
    results.map((result, index) =>
      db
        .from('publisher_pages')
        .update({
          last_checked_at: now.toISOString(),
          attribution_found: result.found,
        })
        .eq('id', pages[index].id),
    ),
  );

  const successfulChecks = results.filter((r) => r.ok);
  const anyFound = successfulChecks.some((r) => r.found === true);
  const allFailed = successfulChecks.length === 0;

  let attributionOk = true;
  let graceUntil = publisher?.attribution_grace_until ?? null;

  if (allFailed) {
    // Could not verify anything this pass — hold the previous verdict.
    attributionOk = !graceUntil || new Date(graceUntil) > now;
  } else if (anyFound) {
    attributionOk = true;
    graceUntil = null; // seen again; clear any running clock
  } else {
    // Every page we could actually load is missing the link.
    if (!graceUntil) {
      graceUntil = new Date(now.getTime() + GRACE_PERIOD_MS).toISOString();
    }
    attributionOk = new Date(graceUntil) > now;
  }

  await db
    .from('publishers')
    .update({
      attribution_ok: attributionOk,
      attribution_checked_at: now.toISOString(),
      attribution_grace_until: graceUntil,
    })
    .eq('id', publisherId);

  return {
    publisherId,
    pagesChecked: results.length,
    pagesWithAttribution: results.filter((r) => r.found === true).length,
    attributionOk,
    graceUntil,
  };
}

/** Run the crawler across every active publisher with at least one known page. */
export async function checkAttributionForAllPublishers(): Promise<PublisherAttributionSummary[]> {
  const { data } = await serviceClient()
    .from('publishers')
    .select('id')
    .eq('active', true);
  const ids = ((data ?? []) as Array<{ id: string }>).map((p) => p.id);
  const out: PublisherAttributionSummary[] = [];
  for (const id of ids) {
    out.push(await checkAttributionForPublisher(id));
  }
  return out;
}
