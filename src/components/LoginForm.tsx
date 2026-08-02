'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Unified sign-in / create-account form.
 * No magic links. No Google. Just email + password.
 * Sign-up collects a leaderboard display name upfront.
 *
 * `popup`/`anonToken` exist for exactly one caller: the embed's "save my
 * score" button opens this page in a `window.open` popup rather than
 * navigating the iframe itself (see docs/widget-handoff.md — the login form
 * must never render inside a third-party iframe). In that mode, success does
 * not redirect; it claims the guest's attempt with the token, tells the
 * opener via postMessage, and closes itself.
 */
export function LoginForm({
  next,
  claim,
  anonToken,
  popup = false,
  alreadySignedIn = false,
}: {
  next: string;
  claim: boolean;
  anonToken?: string;
  popup?: boolean;
  alreadySignedIn?: boolean;
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'check-email' | 'popup-done'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  // Becomes {{ .RedirectTo }} in the Supabase "Confirm signup" email
  // template, which builds the emailed link to /auth/confirm?...&next=<this>.
  // Deliberately the plain landing URL (not /auth/callback) — see
  // src/app/auth/confirm/route.ts for why.
  const redirectTo = () => {
    const base =
      (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '') ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    const url = new URL(next, base);
    if (claim) url.searchParams.set('claim', '1');
    // Carried through in case the confirmation link happens to be opened in
    // the same popup window — best-effort; a link opened from a separate mail
    // client tab has no window.opener regardless, and that's fine.
    if (popup) url.searchParams.set('popup', '1');
    if (anonToken) url.searchParams.set('anonToken', anonToken);
    return url.toString();
  };

  /**
   * The popup-only finish line: claim the guest attempt with the signed
   * token (never a cookie — see src/lib/session.ts), tell the iframe it can
   * refresh, then close. window.opener is same-origin here (both windows are
   * perkul.com; only the iframe's *top-level* page is third-party), so this
   * postMessage is safe to read without an origin check on the sender side.
   */
  const finishPopup = async () => {
    try {
      await fetch('/api/attempt/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ anonToken }),
      });
    } catch {
      /* the leaderboard claim is best-effort; the account itself is already created */
    }
    try {
      window.opener?.postMessage({ source: 'perkul-embed', type: 'claimed' }, '*');
    } catch {
      /* opener may already be gone */
    }
    setStatus('popup-done');
    window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* some browsers refuse to close a window script didn't open cleanly — the status message covers it */
      }
    }, 600);
  };

  useEffect(() => {
    if (popup && alreadySignedIn) void finishPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Produce a human-readable message from whatever Supabase throws */

  const extractMessage = (error: unknown, fallback: string): string => {
    if (!error) return fallback;
    // Log the full error in the browser console so we can diagnose issues.
    console.error('[Auth error]', JSON.stringify(error));
    const msg =
      (error as { message?: string }).message ??
      (error as { error_description?: string }).error_description ??
      (error as { error?: string }).error ??
      (error as { msg?: string }).msg ??
      '';
    // Supabase sometimes returns the raw JSON body '{}'  when SMTP fails
    // or when email rate-limits are hit — normalise to the fallback.
    if (!msg || msg === '{}' || msg === '{"message":""}') return fallback;
    return msg;
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('busy');
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (popup) {
        await finishPopup();
      } else {
        window.location.href = next;
      }
    } catch (error) {
      setStatus('idle');
      setMessage(extractMessage(error, 'Could not sign in. Check your email and password.'));
    }
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('busy');
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo(),
          data: { display_name: displayName.trim() || null },
        },
      });

      // Every signup goes into the Resend "All Contacts" audience, regardless
      // of what happens next below — Supabase Auth only uses Resend as an
      // SMTP relay for the confirmation email, so without this call the
      // address would show up in Resend's Emails tab but never as a contact.
      // Fire-and-forget: a Resend hiccup must never block account creation.
      if (data?.user) {
        fetch('/api/contacts/add', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), displayName: displayName.trim() || undefined }),
        }).catch(() => {});
      }

      // If the user record was created (data.user exists) but email sending
      // failed (SMTP error), still show the confirmation screen. The user
      // exists; they can ask to resend from Supabase or wait for SMTP fix.

      if (data?.user && !data?.session) {
        setStatus('check-email');
        return;
      }

      if (error) throw error;

      // If email confirmation is disabled, Supabase returns a session immediately.
      if (data?.session) {
        if (displayName.trim()) {
          await fetch('/api/profile', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ displayName: displayName.trim(), leaderboardOptIn: true }),
          });
        }
        if (popup) {
          await finishPopup();
        } else {
          window.location.href = next;
        }
      } else {
        setStatus('check-email');
      }
    } catch (error) {
      setStatus('idle');
      setMessage(extractMessage(error, 'Could not create account. Try again.'));
    }
  };

  /* ---------------------------------------------------------------- states */

  if (status === 'popup-done') {
    return (
      <div className="notice notice--quiet">
        <strong>You're all set.</strong> This tab should close automatically — if it doesn't, you
        can close it and go back to the game.
      </div>
    );
  }

  if (status === 'check-email') {
    return (
      <div>
        <div className="notice notice--quiet">
          <strong>Check your inbox.</strong> We sent a confirmation link to{' '}
          <strong>{email}</strong>. Click it to activate your account — you will be
          signed in and your name will be saved automatically.
        </div>
        <p className="label" style={{ marginTop: '1rem' }}>
          Wrong address?{' '}
          <button
            type="button"
            style={{ font: 'inherit', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, color: 'inherit' }}
            onClick={() => { setStatus('idle'); setMessage(null); }}
          >
            Go back
          </button>
        </p>
      </div>
    );
  }

  /* ----------------------------------------------------------------- sign in */

  if (mode === 'signin') {
    return (
      <div>
        <form onSubmit={signIn}>
          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="field">
            <span className="field__label">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          <button type="submit" className="action" disabled={status === 'busy'}>
            {status === 'busy' ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {message ? <div className="notice" style={{ marginTop: '1rem' }}>{message}</div> : null}

        <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
          No account?{' '}
          <button
            type="button"
            className="action--quiet"
            style={{ fontSize: 'inherit', display: 'inline', padding: 0 }}
            onClick={() => { setMode('signup'); setMessage(null); }}
          >
            Create one
          </button>
        </p>
      </div>
    );
  }

  /* --------------------------------------------------------------- sign up */

  return (
    <div>
      <form onSubmit={createAccount}>
        <label className="field">
          <span className="field__label">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </label>
        <label className="field">
          <span className="field__label">Leaderboard name</span>
          <input
            type="text"
            maxLength={20}
            autoComplete="username"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="LexiconKing"
          />
          <span className="label" style={{ display: 'block', marginTop: '0.3rem' }}>
            This is what other players see. You can change it later.
          </span>
        </label>
        <button type="submit" className="action" disabled={status === 'busy'}>
          {status === 'busy' ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      {message ? <div className="notice" style={{ marginTop: '1rem' }}>{message}</div> : null}

      <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
        Already have an account?{' '}
        <button
          type="button"
          className="action--quiet"
          style={{ fontSize: 'inherit', display: 'inline', padding: 0 }}
          onClick={() => { setMode('signin'); setMessage(null); }}
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
