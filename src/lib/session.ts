import 'server-only';
import { cookies } from 'next/headers';
import { randomUUID, createHmac } from 'node:crypto';

/**
 * Anonymous identity.
 *
 * A single signed, httpOnly cookie. No device fingerprinting, no third party
 * identifiers, nothing beyond an opaque random id used to (a) let a guest keep
 * their result and (b) enforce one ranked attempt per day.
 */
export const ANON_COOKIE = 'perkul_sid';
const MAX_AGE = 60 * 60 * 24 * 400;

function secret(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'perkul-dev-secret'
  );
}

function sign(id: string): string {
  return createHmac('sha256', secret()).update(id).digest('base64url').slice(0, 24);
}

export function encodeSession(id: string): string {
  return `${id}.${sign(id)}`;
}

export function decodeSession(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return null;
  const id = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  if (sign(id) !== sig) return null;
  return id;
}

/** Read-only: returns the existing anonymous id, or null. */
export function readAnonSessionId(): string | null {
  return decodeSession(cookies().get(ANON_COOKIE)?.value);
}

export function newAnonSessionId(): string {
  return randomUUID();
}

export const anonCookieOptions = {
  name: ANON_COOKIE,
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE,
};
