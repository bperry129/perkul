import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client. SERVER ONLY.
 *
 * Note: this module deliberately does not import the `server-only` package,
 * because the seed/admin CLI scripts run it from plain Node. It is never
 * imported from a client component — the browser client lives in ./client.ts.
 *
 * Every gameplay and admin read/write that touches answer data goes through
 * this client inside a route handler or server component. The browser never
 * receives these credentials, and RLS denies the anon/authenticated roles any
 * access to the answer tables.
 */
let cached: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Perkul-Server': '1' } },
  });

  return cached;
}

/**
 * Treat obvious stand-in values as "not configured". Without this, a .env.local
 * full of placeholders looks valid, every query quietly fails, and the player
 * gets told "no puzzle today" when the real problem is setup.
 */
function looksLikePlaceholder(value: string): boolean {
  return /placeholder|your[-_]?project|example\.supabase|changeme|xxx|<.+>/i.test(value);
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return false;
  if (looksLikePlaceholder(url) || looksLikePlaceholder(key)) return false;
  return /^https?:\/\/.+/.test(url);
}
