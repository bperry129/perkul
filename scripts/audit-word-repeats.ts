/**
 * Audits every displayed word in the seed bank for repeats.
 *
 * The test suite already covers two cases: all 200 fabrications are unique
 * (`never reuses a fabricated word`), and no word appears twice inside a single
 * game (the validator's `duplicate_in_game`). Neither of those catches a real
 * word that shows up in game #212 and again in game #219 — the bank validates
 * each game against history, and the seed bank has no history to check against.
 * That gap is what this script exists to close.
 *
 *   npx tsx scripts/audit-word-repeats.ts
 *
 * Comparison is on normalizeWord(), the same casing/punctuation-insensitive form
 * the validator and the lexicon use, so REAL and "real" count as one word.
 */
import { SEED_GAMES } from '../src/content';
import { normalizeWord } from '../src/lib/content/draft';

type Placement = {
  gameNumber: number;
  activeDate: string;
  round: number;
  word: string;
  isReal: boolean;
};

const places = new Map<string, Placement[]>();

for (const game of SEED_GAMES) {
  for (const round of game.rounds) {
    for (const option of round.options) {
      const key = normalizeWord(option.word);
      const list = places.get(key) ?? [];
      list.push({
        gameNumber: game.gameNumber,
        activeDate: game.activeDate,
        round: round.position,
        word: option.word,
        isReal: option.isReal,
      });
      places.set(key, list);
    }
  }
}

const totalOptions = [...places.values()].reduce((sum, list) => sum + list.length, 0);
const repeated = [...places.entries()]
  .filter(([, list]) => list.length > 1)
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

console.log(`games:            ${SEED_GAMES.length}`);
console.log(`displayed words:  ${totalOptions}`);
console.log(`distinct words:   ${places.size}`);
console.log(`repeated words:   ${repeated.length}`);
console.log('');

if (repeated.length === 0) {
  console.log('No repeats. Every displayed word in the bank is unique.');
} else {
  for (const [key, list] of repeated) {
    // Same game twice is a harder failure than the same word on two days: the
    // player sees both in one sitting.
    const sameGame = new Set(list.map((p) => p.gameNumber)).size < list.length;
    const kinds = new Set(list.map((p) => (p.isReal ? 'real' : 'fake')));
    const tags = [
      sameGame ? 'SAME GAME' : null,
      kinds.size > 1 ? 'REAL+FAKE' : null,
    ].filter(Boolean);

    console.log(
      `${list[0].word}  ×${list.length}${tags.length ? `  [${tags.join(' · ')}]` : ''}`,
    );
    for (const p of list) {
      console.log(
        `    #${p.gameNumber}  ${p.activeDate}  round ${String(p.round).padStart(2)}  ${
          p.isReal ? 'real' : 'FAKE'
        }`,
      );
    }
    console.log('');
  }
  console.log(`${repeated.length} word(s) appear more than once. Key: ${repeated.map(([k]) => k).join(', ')}`);
}
