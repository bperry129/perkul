'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Email magic link + Google. Apple can be added by dropping another provider
 * button in here once the Supabase provider is configured — no other changes.
 */
export function LoginForm({ next, claim }: { next: string; claim: boolean }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const redirectTo = () => {
    const url = new URL('/auth/callback', window.location.origin);
    url.searchParams.set('next', next);
    if (claim) url.searchParams.set('claim', '1');
    return url.toString();
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
          {status === 'sending' ? 'Sending…' : 'Email me a link'}
        </button>
      </form>

      <div className="toolbar" style={{ marginTop: '1.5rem' }}>
        <button type="button" className="action action--ghost" onClick={google}>
          Continue with Google
        </button>
      </div>

      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
