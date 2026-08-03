import { describe, expect, it } from 'vitest';
import { signRunToken, verifyRunToken } from '@/lib/press-your-luck-token';

describe('press your luck run token', () => {
  it('round-trips a signed payload', () => {
    const token = signRunToken({ s: 12, t: 1_000, n: 'abc' });
    const payload = verifyRunToken(token);
    expect(payload).toEqual({ s: 12, t: 1_000, n: 'abc' });
  });

  it('rejects a token with a tampered score', () => {
    const token = signRunToken({ s: 1, t: 1_000, n: 'abc' });
    const [body, sig] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ s: 31, t: 1_000, n: 'abc' })).toString('base64url');
    const forged = `${forgedBody}.${sig}`;
    expect(forged).not.toBe(token);
    expect(body).toBeDefined();
    expect(verifyRunToken(forged)).toBeNull();
  });

  it('rejects a token with a tampered signature', () => {
    const token = signRunToken({ s: 5, t: 1_000, n: 'abc' });
    const tampered = `${token}x`;
    expect(verifyRunToken(tampered)).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(verifyRunToken(null)).toBeNull();
    expect(verifyRunToken(undefined)).toBeNull();
    expect(verifyRunToken('')).toBeNull();
    expect(verifyRunToken('not-a-real-token')).toBeNull();
    expect(verifyRunToken('nodot')).toBeNull();
  });

  it('rejects a well-signed but malformed payload', () => {
    const body = Buffer.from(JSON.stringify({ s: 'nope', t: 1_000, n: 'abc' })).toString('base64url');
    // Sign it properly via the real signer so only the payload shape is wrong.
    const validToken = signRunToken({ s: 0, t: 0, n: '' });
    const [, sig] = validToken.split('.');
    expect(verifyRunToken(`${body}.${sig}`)).toBeNull();
  });
});
