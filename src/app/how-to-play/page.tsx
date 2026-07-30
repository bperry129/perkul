import Link from 'next/link';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'How to Play Perkul — Daily Word Puzzle Game Rules',
  description:
    'Learn how to play Perkul, the free daily word puzzle game. Five words each round — one is fake. Guess correctly, beat the clock, and top the leaderboard. Rules, scoring, and FAQ.',
};

const faqItems = [
  {
    question: 'What is Perkul?',
    answer:
      'Perkul is a free daily word puzzle game. Each day a new puzzle launches with ten rounds. In every round you see five words — four are real English words, one is completely made up. Your job is to identify the fake word. The player with the most correct answers in the fastest time tops the leaderboard.',
  },
  {
    question: 'Is Perkul free to play?',
    answer:
      'Yes. Perkul is completely free. No subscription, no paywall, no account required to play. Create a free account if you want a leaderboard name and to track your history across devices.',
  },
  {
    question: 'How is Perkul different from Wordle?',
    answer:
      "Wordle gives you one mystery word to identify through letter guesses, once a day. Perkul gives you five words each round — four real, one fake — and challenges you to spot the fabrication. There are ten rounds, no hints between selections, and a competitive live leaderboard based on both accuracy and speed. Where Wordle is over in under two minutes, Perkul takes five to ten and ends with an explanation of every word.",
  },
  {
    question: 'How is the score calculated?',
    answer:
      'Each correct answer is worth 1,000 points. Every second of elapsed time costs 8 points. A perfect 10/10 starts at 10,000 points and decreases the longer you take. So the fastest perfect game wins, but a quick 9/10 can beat a slow 10/10.',
  },
  {
    question: 'When does the new puzzle come out?',
    answer: 'A new Perkul puzzle launches every day at midnight Eastern Time (New York).',
  },
  {
    question: 'Can I play on my phone?',
    answer:
      'Yes. Perkul is fully mobile-optimised and works in any browser — no app download required. The keyboard shortcut (keys 1–5) also works on desktop.',
  },
  {
    question: 'How do I get on the leaderboard?',
    answer:
      'Create a free account and choose a display name. Your score is saved automatically at the end of each ranked game and appears on the public daily leaderboard.',
  },
  {
    question: 'Is there only one game per day?',
    answer:
      'One ranked game per day. After you finish, you can play again for practice, but only your first attempt counts for the leaderboard.',
  },
  {
    question: 'What makes a word eligible for Perkul?',
    answer:
      "Perkul uses a curated modern English lexicon. Words must be real and encounterable by an educated English speaker — no highly archaic terms, no proper nouns, no abbreviations, no jargon that would only appear in a specialist dictionary. Read the full word policy for details.",
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
};

export default function HowToPlayPage() {
  return (
    <div className="shell shell--narrow prose">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="dateline">
        <span>Instructions</span>
        <span>{BRAND.name}</span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.5rem)' }}>
        Five words. One is fake.
      </h1>

      <p>
        Choose the fake word in each of 10 rounds. You get one choice. Your first attempt counts.
        Most correct wins. Speed breaks ties.
      </p>

      <p>That is genuinely all of it.</p>

      <h2>The details, if you want them</h2>
      <ul>
        <li>Every round shows five words: four are real, one was made up by us.</li>
        <li>One selection per round. It is committed the moment you make it.</li>
        <li>
          You will not see whether you were right until all ten rounds are done. No green, no red, no
          hints.
        </li>
        <li>The clock starts when you press start, and stops on your tenth selection.</li>
        <li>
          Ranking is score-based: most right wins. Speed breaks ties, so a slow perfect game can lose
          to a fast 9/10.
        </li>
        <li>Refreshing mid-game does not reset your timer — the clock lives on the server.</li>
        <li>Keys 1 to 5 select words if you prefer the keyboard.</li>
      </ul>

      <h2>Expect to be wrong sometimes</h2>
      <p>
        {BRAND.name} is harder than most daily word games, and it is meant to be. Each round has a
        real word chosen specifically because it looks fake, and a fake word built to look
        respectable. You should recognise three words per round comfortably. The other two are the
        game.
      </p>

      <h2>Scoring</h2>
      <p>
        Each correct answer earns 1,000 points. Every second of elapsed time costs 8 points. A
        perfect 10/10 starts at 10,000 points and decreases the longer you take. The fastest
        perfect game wins, but a quick 9/10 can beat a slow 10/10 — so accuracy matters more than
        speed until you are already accurate.
      </p>

      <h2>Afterwards</h2>
      <p>
        Every round is explained: which word was fabricated, why it was believable, and which real
        word was the trap. That is where the game repays the difficulty.
      </p>

      <h2>Words</h2>
      <p>
        We use a curated modern-English lexicon rather than everything ever recorded in English.{' '}
        <Link href="/word-policy">Read the word policy</Link> for what does and does not count.
      </p>

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        <Link className="action" href="/">
          Play today's game
        </Link>
      </div>

      <h2 style={{ marginTop: '3rem' }}>Frequently asked questions</h2>
      <dl>
        {faqItems.map((item) => (
          <div key={item.question} style={{ marginBottom: '1.5rem' }}>
            <dt style={{ fontWeight: 700 }}>{item.question}</dt>
            <dd style={{ marginLeft: 0, marginTop: '0.4rem' }}>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
