import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <div className="shell shell--narrow prose">
      <div className="dateline">
        <span>Privacy</span>
        <span>{BRAND.name}</span>
      </div>
      <h1 className="lede" style={{ fontSize: 'clamp(1.7rem, 6vw, 2.3rem)' }}>
        We collect as little as possible.
      </h1>

      <h2>Playing without an account</h2>
      <p>
        We set one first-party cookie containing a random identifier. It exists so your result
        survives a page refresh and so the one-attempt-per-day rule works. We do not fingerprint your
        device, and we do not run third-party trackers.
      </p>

      <h2>With an account</h2>
      <p>
        We store your email address (for sign-in only), a display name you choose, and your game
        history. Your email is never shown on the leaderboard — display names only.
      </p>

      <h2>Leaderboard</h2>
      <p>
        You can opt out of the public leaderboard at any time from your account. An opted-out result
        may still contribute anonymously to aggregate puzzle statistics, such as what percentage of
        players found a given round difficult.
      </p>

      <h2>Analytics</h2>
      <p>
        We record our own product events — a game was started, a game was completed, a result was
        shared — in our own database. Puzzle answers are never sent to third parties.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Email <a href={`mailto:privacy@${BRAND.domain}`}>privacy@{BRAND.domain}</a> and we will remove
        your account and attempt history.
      </p>
    </div>
  );
}
