import 'server-only';
import { cache } from 'react';
import { serviceClient, isSupabaseConfigured } from './supabase/admin';

/**
 * The publisher registry — who may embed the game, and from where.
 *
 * Read on every embed request, so it is wrapped in React's per-request `cache`:
 * the page and the layout both need the same row and neither should pay for it
 * twice.
 */

export type PublisherRow = {
  id: string;
  key: string;
  name: string;
  allowed_origins: string[];
  active: boolean;
  attribution_ok: boolean;
};

/** Keys travel in URLs and end up in other people's HTML. Keep them boring. */
const KEY_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

export const findPublisher = cache(async (key: string | null): Promise<PublisherRow | null> => {
  // Reject malformed keys before touching the database. A key is attacker
  // controlled input that we are about to interpolate into a CSP header.
  if (!key || !KEY_PATTERN.test(key) || !isSupabaseConfigured()) return null;

  const { data } = await serviceClient()
    .from('publishers')
    .select('id, key, name, allowed_origins, active, attribution_ok')
    .eq('key', key)
    .eq('active', true)
    .maybeSingle();

  return (data as PublisherRow | null) ?? null;
});

/**
 * Only scheme + host, and only https. Anything else is dropped rather than
 * escaped, because this string is concatenated into a security header and a
 * header injection there would let a publisher authorise the whole internet to
 * frame us. Localhost over http is allowed in development so the embed can be
 * tested against a scratch page without a certificate.
 */
export function normalizeOrigin(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) return null;
  // A CSP source must not carry a path, query or fragment.
  return url.origin;
}

/**
 * The `frame-ancestors` value for a publisher.
 *
 * `'none'` for an unknown or suspended key: an embed that cannot prove who it
 * belongs to is refused framing outright, so a leaked snippet is worthless on a
 * domain we have not agreed to. A publisher with no origins recorded yet is in
 * the same position — an empty allowlist means nobody, not everybody, which is
 * the safe direction for a default to fail in.
 */
export function frameAncestors(publisher: PublisherRow | null): string {
  if (!publisher) return "frame-ancestors 'none'";

  const origins = publisher.allowed_origins
    .map(normalizeOrigin)
    .filter((value): value is string => value !== null);

  if (origins.length === 0) return "frame-ancestors 'none'";
  // 'self' keeps our own /for-publishers demo embed working.
  return `frame-ancestors 'self' ${origins.join(' ')}`;
}
