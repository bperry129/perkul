import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Server-authoritative run state, signed so the client can hold it between
 * requests without a database write on every single press.
 *
 * Why this exists: the very first version of this game rolled the bust
 * chance in the browser and asked the client to `POST` whatever final score
 * it landed on. That is fine for a for-fun counter, but this game now has a
 * real $25 prize attached to reaching a specific score — and a client-side
 * roll means anyone with devtools open can skip the game entirely and just
 * `fetch()` the submit endpoint with `{ score: 31 }`. That hole is closed by
 * moving the roll here: the score only ever changes because *this* module,
 * on *this* server, drew a random number nothing in the browser can see or
 * influence, and the token is the tamper-evident receipt of that decision.
 *
 * The secret is the Supabase service-role key: already server-only, already
 * a secret nothing in this codebase exposes to a client, and reusing it means
 * one less environment variable to provision and forget. It is used here
 * only as HMAC key material, never sent anywhere.
 */
const SECRET =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'perkul-dev-secret';

export type RunTokenPayload = {
  /** Score reached so far this run. */
  s: number;
  /** `Date.now()` of the last press that produced this token. */
  t: number;
  /** Per-run random id, carried along for no reason but future audit trails. */
  n: string;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('base64url');
}

export function signRunToken(payload: RunTokenPayload): string {
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/**
 * Verifies the signature (constant-time comparison — this is exactly the
 * kind of check a timing side-channel could otherwise leak) and the shape of
 * the payload. Returns null for anything malformed, tampered, or simply
 * absent; callers treat that identically to "start a brand new run at zero",
 * which is the only thing a forged or corrupted token can ever buy someone.
 */
export function verifyRunToken(token: string | null | undefined): RunTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as RunTokenPayload;
    if (
      typeof payload.s !== 'number' ||
      !Number.isFinite(payload.s) ||
      payload.s < 0 ||
      typeof payload.t !== 'number' ||
      !Number.isFinite(payload.t) ||
      typeof payload.n !== 'string'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
