import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from './supabase/server';
import { serviceClient, isSupabaseConfigured } from './supabase/admin';
import { readAnonSessionId } from './session';
import type { Identity } from './attempts';

export type ProfileRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  leaderboard_opt_in: boolean;
  is_admin: boolean;
  is_banned_name: boolean;
  preferences: Record<string, unknown>;
  created_at: string;
};

/** Who is playing: an account, or a signed anonymous session cookie. */
export const getIdentity = cache(async (): Promise<Identity> => {
  const user = await getSessionUser();
  const anonId = readAnonSessionId();
  return { userId: user?.id ?? null, anonId };
});

export const getProfile = cache(async (): Promise<ProfileRow | null> => {
  if (!isSupabaseConfigured()) return null;
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await serviceClient()
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
});

export async function isAdmin(): Promise<boolean> {
  const profile = await getProfile();
  return Boolean(profile?.is_admin);
}

/** Server-side authorization for /admin. Hidden navigation is not security. */
export async function requireAdmin(): Promise<ProfileRow> {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/admin');
  const profile = await getProfile();
  if (!profile?.is_admin) redirect('/?admin=denied');
  return profile;
}

/** Route-handler variant: no redirects, just a verdict. */
export async function adminGuard(): Promise<{ ok: boolean; userId: string | null }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, userId: null };
  const { data } = await serviceClient()
    .from('profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .maybeSingle();
  return { ok: Boolean((data as { is_admin?: boolean } | null)?.is_admin), userId: user.id };
}

const RESERVED_NAMES = new Set(['admin', 'perkul', 'moderator', 'staff', 'official', 'guest', 'you']);

export function validateDisplayName(name: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = name.trim().replace(/\s+/g, ' ');
  if (value.length < 3) return { ok: false, message: 'Display names need at least 3 characters.' };
  if (value.length > 20) return { ok: false, message: 'Display names are limited to 20 characters.' };
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(value)) {
    return { ok: false, message: 'Use letters, numbers, spaces, dots, dashes or underscores.' };
  }
  if (RESERVED_NAMES.has(value.toLowerCase())) {
    return { ok: false, message: 'That name is reserved.' };
  }
  return { ok: true, value };
}

export async function setDisplayName(
  userId: string,
  name: string,
): Promise<{ ok: boolean; message?: string }> {
  const check = validateDisplayName(name);
  if (!check.ok) return { ok: false, message: check.message };

  const { error } = await serviceClient()
    .from('profiles')
    .update({ display_name: check.value })
    .eq('user_id', userId);

  if (error) {
    if (error.code === '23505' || error.code === '23514' || /duplicate/i.test(error.message)) {
      return { ok: false, message: 'That display name is already taken.' };
    }
    return { ok: false, message: 'Could not update your display name.' };
  }
  return { ok: true };
}
