import Link from 'next/link';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Word policy',
  description: `What ${BRAND.name} considers a word, and what it does not.`,
};

export default function WordPolicyPage() {
  return (
    <div className="shell shell--narrow prose">
      <div className="dateline">
        <span>Editorial policy</span>
        <span>Version 1</span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.5rem)' }}>
        What counts as a word.
      </h1>

      <p>
        {BRAND.name} runs on a curated modern-English lexicon that we maintain ourselves. Being
        recorded somewhere in the history of English is not sufficient. A word earns its place if an
        educated English speaker could reasonably encounter it - even if they personally do not know
        it.
      </p>

      <h2>Included</h2>
      <ul>
        <li>Standard modern English words, common and uncommon.</li>
        <li>
          Difficult but genuinely encounterable vocabulary: <strong>DEARTH</strong>,{' '}
          <strong>SINEW</strong>, <strong>FROND</strong>, <strong>CAVIL</strong>. Occasionally
          something like <strong>BRUME</strong> as a hard decoy.
        </li>
        <li>Words with a real presence in contemporary writing.</li>
      </ul>

      <h2>Excluded</h2>
      <ul>
        <li>Proper nouns, place names, surnames and brand names.</li>
        <li>Abbreviations and acronyms.</li>
        <li>Obsolete and highly archaic vocabulary.</li>
        <li>Narrow regional dialect forms and obscure historical spellings.</li>
        <li>Technical jargon with no general readership.</li>
        <li>Foreign words that have not genuinely entered English.</li>
        <li>Intentional misspellings and internet slang.</li>
      </ul>

      <p>
        A fourteenth-century Scottish spelling that survives in one specialist dictionary is not a
        fair puzzle answer, and it will not appear here.
      </p>

      <h2>The fabricated word</h2>
      <p>
        Every fake is written to obey English spelling and sound patterns, and every fake is checked
        against the accepted lexicon before a game can be published. If a fabrication turns out to be
        a real accepted word, that is a bug in our content and we want to know.
      </p>

      <h2>Fairness</h2>
      <p>
        Rounds are built so that roughly three of the five words are reasonable anchors for a strong
        vocabulary player, one is a legitimate word chosen because it looks like the fake, and one is
        the fabrication. Five obscure words is a failure state, not a difficulty setting.
      </p>

      <h2>Disputes</h2>
      <p>
        If you believe a word was wrong - a fake that is real, a real word that should not qualify, or
        a definition that misleads - tell us. Include the game number and the round. Reports go to{' '}
        <a href={`mailto:words@${BRAND.domain}`}>words@{BRAND.domain}</a> and are reviewed
        editorially. Corrections are made to the lexicon so the same dispute cannot recur.
      </p>

      <h2>Not machine-generated at play time</h2>
      <p>
        Games are written, validated and reviewed before publication. Nothing you play was generated
        by a language model at the moment you pressed start. The fake words are hand-crafted, not
        AI-generated.
      </p>

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        <Link className="action action--ghost" href="/how-to-play">
          How to play
        </Link>
      </div>
    </div>
  );
}
