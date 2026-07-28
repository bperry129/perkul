'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Email magic link + Password + Google.
 *
 * redirectTo uses NEXT_PUBLIC_SITE_URL so that magic links always point at
 * the production domain regardless of where the page was SSR'd. If the env
 * var is not set, window.location.origin is the correct fallback for local dev.
 */
export function LoginForm({ next, claim }: { next: string; claim: boolean }) {
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const redirectTo = () => {
    // Use the configured site URL so production magic links never point at localhost.
    const base =
      (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '') ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    const url = new URL('/auth/callback', base);
    url.searchParams.set('next', next);
    if (claim) url.searchParams.set('claim', '1');
    return url.toString();
  };

  const signInWithPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('sending');
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      // Redirect on success
      window.location.href = next;
    } catch (error) {
      setStatus('error');
      setMessage((error as Error).message || 'Could not sign in. Check your email and password.');
    }
  };

  const sendLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('sending');
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo() },
      });
      if (error) throw error;
      setStatus('sent');
    } catch (error) {
      setStatus('error');
      setMessage((error as Error).message || 'Could not send the link.');
    }
  };

  const google = async () => {
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo() },
      });
      if (error) throw error;
    } catch (error) {
      setStatus('error');
      setMessage((error as Error).message || 'Google sign-in is unavailable.');
    }
  };

  if (status === 'sent') {
    return (
      <div className="notice notice--quiet">
        Check <strong>{email}</strong> for a sign-in link. It opens straight back into your account.
      </div>
    );
  }

  return (
    <div>
      {/* Mode toggle */}
      <div className="toolbar" style={{ marginBottom: '1.5rem' }}>
        <button
          type="button"
          className={mode === 'password' ? 'action' : 'action action--ghost'}
          onClick={() => { setMode('password'); setMessage(null); setStatus('idle'); }}
        >
          Password
        </button>
        <button
          type="button"
          className={mode === 'link' ? 'action' : 'action action--ghost'}
          onClick={() => { setMode('link'); setMessage(null); setStatus('idle'); }}
        >
          Email link
        </button>
      </div>

      {mode === 'password' ? (
        <form onSubmit={signInWithPassword}>
          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </label>
          <button type="submit" className="action" disabled={status === 'sending'}>
            {status === 'sending' ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      ) : (
        <form onSubmit={sendLink}>
          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button type="submit" className="action" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending...' : 'Email me a link'}
          </button>
        </form>
      )}

      <div className="toolbar" style={{ marginTop: '1.5rem' }}>
        <button type="button" className="action action--ghost" onClick={google}>
          Continue with Google
        </button>
      </div>

      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
