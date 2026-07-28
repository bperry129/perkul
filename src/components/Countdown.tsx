'use client';

import { useEffect, useState } from 'react';
import { BRAND } from '@/lib/brand';
import { formatCountdown } from '@/lib/time';

/**
 * Counts down to the next New York midnight. The server sends the exact target
 * instant, so DST never shifts the clock by an hour.
 */
export function Countdown({ targetIso }: { targetIso: string }) {
  const target = Date.parse(targetIso);
  const [remaining, setRemaining] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, target - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  return (
    <div className="dateline" style={{ borderTop: '1px solid var(--rule)' }}>
      <span>Next {BRAND.name} in</span>
      <span className="numerals" style={{ fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>
        {remaining > 0 ? formatCountdown(remaining) : 'now — refresh'}
      </span>
    </div>
  );
}
