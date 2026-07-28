import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <div className="shell shell--narrow prose">
      <div className="dateline">
        <span>Terms</span>
        <span>{BRAND.name}</span>
      </div>
      <h1 className="lede" style={{ fontSize: 'clamp(1.7rem, 6vw, 2.3rem)' }}>
        Short and reasonable.
      </h1>

      <h2>Using the game</h2>
      <p>
        {BRAND.name} is free to play. Do not attempt to extract answer keys, automate play, or submit
        scores you did not earn. Attempts that look automated or impossible are flagged and kept out
        of public ranking.
      </p>

      <h2>Accounts</h2>
      <p>
        You are responsible for the display name you choose. Abusive or impersonating names may be
        changed or removed.
      </p>

      <h2>Content</h2>
      <p>
        Puzzles, definitions and explanations are our editorial work. Sharing your daily result is
        encouraged; republishing the puzzle content is not.
      </p>

      <h2>No warranty</h2>
      <p>
        The game is provided as-is. Words are curated by humans, humans are fallible, and disputes
        are handled through the word policy.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:hello@${BRAND.domain}`}>hello@{BRAND.domain}</a>
      </p>
    </div>
  );
}
