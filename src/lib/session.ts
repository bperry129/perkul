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

/**
 * A one-time bridge for the popup sign-in flow, and the reason it has to
 * exist at all: the anon id inside `/embed/*` lives in a CHIPS-partitioned
 * jar keyed to the *publisher's* top-level site (see embedCookieOptions
 * above), while the sign-in popup is its own top-level navigation to
 * perkul.com and therefore gets the ordinary, unpartitioned jar — a
 * completely different cookie store with no way to see the embed's anon id.
 * There is no cookie that is simultaneously readable from both contexts.
 *
 * So the embed page hands the anon id to its own client as a short-lived
 * signed token (never the raw id — a bare id would let anyone claim anyone
 * else's guest attempts just by guessing or reading one out of devtools),
 * the client passes that token to the popup on perkul.com in the URL, and the
 * popup's own first-party request to /api/attempt/claim verifies the
 * signature and expiry before trusting it. Ten minutes is generous for
 * "finish a ten-round game, then decide to sign up" and short enough that a
 * leaked or logged URL is worthless shortly after.
 */
const CLAIM_TOKEN_TTL_MS = 10 * 60 * 1000;

export function signClaimToken(anonId: string): string {
  const expires = Date.now() + CLAIM_TOKEN_TTL_MS;
  const payload = `${anonId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyClaimToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [anonId, expiresRaw, sig] = parts;
  const payload = `${anonId}.${expiresRaw}`;
  if (sign(payload) !== sig) return null;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;
  return anonId || null;
}



