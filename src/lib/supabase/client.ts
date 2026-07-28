'use client';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser client. Used only for auth (magic link, OAuth) and for reading
 * feature flags. It has no access to answer data: RLS denies the anon and
 * authenticated roles on games / rounds / round_options entirely.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  );
}
