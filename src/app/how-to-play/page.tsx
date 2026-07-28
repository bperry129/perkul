import Link from 'next/link';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'How to play',
  description: 'Five words. One is fake. Ten rounds. Accuracy wins, speed breaks ties.',
};

export default function HowToPlayPage() {
  return (
    <div className="shell shell--narrow prose">
      <div className="dateline">
        <span>Instructions</span>
        <span>{BRAND.name}</span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.5rem)' }}>
        Five words. One is fake.
      </h1>

      <p>
        Choose the invented word in each of 10 rounds. You get one choice. Your first attempt counts.
        Most correct wins. Speed breaks ties.
      </p>

      <p>That is genuinely all of it.</p>

      <h2>The details, if you want them</h2>
      <ul>
        <li>Every round shows five words: four are real, one was fabricated by us.</li>
        <li>One selection per round. It is committed the moment you make it.</li>
        <li>
          You will not see whether you were right until all ten rounds are done. No green, no red, no
          hints.
        </li>
        <li>The clock starts when you press start, and stops on your tenth selection.</li>
        <li>
          Ranking is accuracy first: a 10/10 in 1:12 finishes above a 9/10 in 0:31. Time only
          separates equal scores.
        </li>
        <li>Refreshing mid-game does not reset your timer — the clock lives on the server.</li>
        <li>Keys 1 to 5 select words if you prefer the keyboard.</li>
      </ul>

      <h2>Expect to be wrong sometimes</h2>
      <p>
        {BRAND.name} is harder than most daily word games, and it is meant to be. Each round has a
        real word chosen specifically because it looks invented, and a fake built to look
        respectable. You should recognise three words per round comfortably. The other two are the
        game.
      </p>

      <h2>Afterwards</h2>
      <p>
        Every round is explained: which word was fabricated, why it was believable, and which real
        word was the trap. That is where the game repays the difficulty.
      </p>

      <h3>Words</h3>
      <p>
        We use a curated modern-English lexicon rather than everything ever recorded in English.{' '}
        <Link href="/word-policy">Read the word policy</Link> for what does and does not count.
      </p>

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        <Link className="action" href="/">
          Play today’s game
        </Link>
      </div>
    </div>
  );
}
