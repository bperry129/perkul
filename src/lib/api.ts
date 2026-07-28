import 'server-only';
import { NextResponse } from 'next/server';
import { getSessionUser } from './supabase/server';
import {
  anonCookieOptions,
  encodeSession,
  newAnonSessionId,
  readAnonSessionId,
} from './session';
import type { Identity } from './attempts';

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function fail(message: string, code = 'error', status = 400): NextResponse {
  return json({ ok: false, code, message }, status);
}

/**
 * Establishes the play identity for a request. If the visitor has no anonymous
 * session yet we mint one and hand the cookie back on the response — the
 * browser never chooses its own id.
 */
export async function resolveIdentity(): Promise<{
  identity: Identity;
  freshAnonId: string | null;
}> {
  const user = await getSessionUser();
  const existing = readAnonSessionId();
  if (user) return { identity: { userId: user.id, anonId: existing }, freshAnonId: null };
  if (existing) return { identity: { userId: null, anonId: existing }, freshAnonId: null };
  const anonId = newAnonSessionId();
  return { identity: { userId: null, anonId }, freshAnonId: anonId };
}

export function attachAnonCookie(response: NextResponse, freshAnonId: string | null): NextResponse {
  if (!freshAnonId) return response;
  response.cookies.set({ ...anonCookieOptions, value: encodeSession(freshAnonId) });
  return response;
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
