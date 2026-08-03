'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Routes where the "embed this game" pitch doesn't belong — currently just
 * the giveaway page, where a request to reuse the game elsewhere would step
 * on the $25 prize rules and the on-page leaderboard entirely. */
const HIDDEN_ON = ['/games/press-your-luck'];

export function EmbedNudge() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return null;
  }

  return (
    <div className="embed-nudge">
      <Link href="/for-publishers">Embed this game on your website →</Link>
    </div>
  );
}
