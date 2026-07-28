'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Unified sign-in / create-account form.
 * No magic links. No Google. Just email + password.
 * Sign-up collects a leaderboard display name upfront.
 */
export function LoginForm({ next, claim }: { next: string; claim: boolean }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'check-email'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const redirectTo = () => {
    const base =
      (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '') ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    const url = new URL('/auth/callback', base);
    url.searchParams.set('next', next);
    if (claim) url.searchParams.set('claim', '1');
    return url.toString();
  };

  /** Produce a human-readable message from whatever Supabase throws */
  const extractMessage = (error: unknown, fallback: string): string => {
    if (!error) return fallback;
    const msg =
      (error as { message?: string }).message ??
      (error as { error_description?: string }).error_description ??
      JSON.stringify(error);
    // Supabase sometimes returns the raw JSON body '{}'  when SMTP fails —
    // normalise that into a readable message.
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
      window.location.href = next;
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
        window.location.href = next;
      } else {
        setStatus('check-email');
      }
    } catch (error) {
      setStatus('idle');
      setMessage(extractMessage(error, 'Could not create account. Try again.'));
    }
  };

  /* ---------------------------------------------------------------- states */

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
