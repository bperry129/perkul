import 'server-only';
import { serviceClient } from './supabase/admin';

/**
 * Admin-only reads for `/admin/publishers`. Separate from `src/lib/publishers.ts`
 * on purpose: that file is the hot, request-cached path the embed itself reads
 * on every render and is deliberately minimal. This file is the slower,
 * admin-only path — full row shape, joined counts, no caching, because a
 * stale count on a dashboard nobody but staff sees is a non-problem.
 */

export type PublisherAdminRow = {
  id: string;
  key: string;
  name: string;
  contact_email: string | null;
  allowed_origins: string[];
  active: boolean;
  attribution_ok: boolean;
  attribution_checked_at: string | null;
  attribution_grace_until: string | null;
  ads_enabled: boolean;
  notes: string | null;
  created_at: string;
  pageCount: number;
  attemptCount: number;
};

export async function listPublishers(): Promise<PublisherAdminRow[]> {
  const db = serviceClient();
  const { data } = await db
    .from('publishers')
    .select(
      'id, key, name, contact_email, allowed_origins, active, attribution_ok, attribution_checked_at, attribution_grace_until, ads_enabled, notes, created_at',
    )
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Array<Omit<PublisherAdminRow, 'pageCount' | 'attemptCount'>>;
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);

  const { data: pageRows } = await db
    .from('publisher_pages')
    .select('publisher_id')
    .in('publisher_id', ids);
  const pageCounts = new Map<string, number>();
  for (const row of (pageRows ?? []) as Array<{ publisher_id: string }>) {
    pageCounts.set(row.publisher_id, (pageCounts.get(row.publisher_id) ?? 0) + 1);
  }

  const { data: attemptRows } = await db
    .from('attempts')
    .select('publisher_id')
    .in('publisher_id', ids);
  const attemptCounts = new Map<string, number>();
  for (const row of (attemptRows ?? []) as Array<{ publisher_id: string }>) {
    attemptCounts.set(row.publisher_id, (attemptCounts.get(row.publisher_id) ?? 0) + 1);
  }

  return rows.map((row) => ({
    ...row,
    pageCount: pageCounts.get(row.id) ?? 0,
    attemptCount: attemptCounts.get(row.id) ?? 0,
  }));
}

export type PublisherPageRow = {
  id: string;
  url: string;
  first_seen_at: string;
  last_seen_at: string;
  last_checked_at: string | null;
  attribution_found: boolean | null;
};

export async function listPublisherPages(publisherId: string): Promise<PublisherPageRow[]> {
  const { data } = await serviceClient()
    .from('publisher_pages')
    .select('id, url, first_seen_at, last_seen_at, last_checked_at, attribution_found')
    .eq('publisher_id', publisherId)
    .order('last_seen_at', { ascending: false });
  return (data ?? []) as PublisherPageRow[];
}

/** A boring random key: URL-safe, long enough not to collide, easy to read out over a support call if it ever comes to that. */
export function generatePublisherKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
}
