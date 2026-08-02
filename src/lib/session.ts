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

/**
 * The same cookie, for a player inside a third-party iframe.
 *
 * `SameSite=Lax` — correct and safe for our own site — is simply *not sent* by
 * the browser in a cross-site frame. Left alone, an embedded player has no
 * identity at all: they cannot keep their result and the one-ranked-game-a-day
 * rule has nothing to key on. `None` is the only value that survives the trip,
 * and it requires `Secure`.
 *
 * `Partitioned` (CHIPS) is deliberate rather than incidental. It gives each
 * top-level publisher its own isolated jar, so this cookie can never be used to
 * follow a reader from one news site to another — the thing third-party cookies
 * are rightly distrusted for. We accept the cost that comes with it: the same
 * human embedding on two different sites is two different anonymous players.
 *
 * That cost is affordable *because* embedded play is unranked until sign-in.
 * Nothing on the public leaderboard depends on this cookie being unique per
 * person; it only has to hold a game together for the length of a visit. The
 * moment a player wants their name on the board they sign in through a popup on
 * our own origin, where the ordinary first-party cookie above applies and the
 * usual guarantees come back.
 *
 * Safari and Firefox block third-party cookies outright regardless of any of
 * this, so the embed must still work when nothing is stored — treat a missing
 * id as a fresh guest rather than an error.
 */
export const embedCookieOptions = {
  name: ANON_COOKIE,
  httpOnly: true,
  sameSite: 'none' as const,
  secure: true,
  partitioned: true,
  path: '/',
  maxAge: MAX_AGE,
};


