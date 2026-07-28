'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function ProfileForm({
  displayName,
  leaderboardOptIn,
}: {
  displayName: string | null;
  leaderboardOptIn: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName ?? '');
  const [optIn, setOptIn] = useState(leaderboardOptIn);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: name, leaderboardOptIn: optIn }),
    });
    const payload = (await response.json()) as { ok?: boolean; message?: string };
    setBusy(false);
    setMessage(payload.ok ? 'Saved.' : payload.message ?? 'Could not save.');
    if (payload.ok) router.refresh();
  };

  const claim = async () => {
    setBusy(true);
    const response = await fetch('/api/attempt/claim', { method: 'POST' });
    const payload = (await response.json()) as { claimed?: number; message?: string };
    setBusy(false);
    setMessage(
      payload.claimed
        ? `${payload.claimed} guest ${payload.claimed === 1 ? 'result' : 'results'} moved into this account.`
        : payload.message ?? 'No guest results found on this device.',
    );
    router.refresh();
  };

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <div>
      <form onSubmit={save}>
        <label className="field">
          <span className="field__label">Leaderboard name</span>
          <input
            type="text"
            value={name}
            maxLength={20}
            onChange={(event) => setName(event.target.value)}
            placeholder="LexiconKing"
          />
        </label>

        <label className="checklist" style={{ marginBottom: '1.2rem' }}>
          <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={optIn}
              onChange={(event) => setOptIn(event.target.checked)}
            />
            Show me on the public daily leaderboard
          </span>
        </label>

        <div className="toolbar">
          <button type="submit" className="action" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="action action--ghost" onClick={claim} disabled={busy}>
            Claim guest results
          </button>
          <button type="button" className="action--quiet" onClick={signOut}>
            Sign out
          </button>
        </div>
      </form>

      {message ? <div className="notice notice--quiet">{message}</div> : null}
    </div>
  );
}
