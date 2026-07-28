/**
 * "Generate Next Bank Prompt".
 *
 * The runtime game engine never talks to an LLM. This produces a single
 * copy-pasteable editorial brief — including the real historical word lists
 * pulled from the database — which an administrator hands to an AI offline. The
 * JSON that comes back is imported, validated and reviewed by a human.
 */
import { BRAND, BRAND_UPPER } from './brand';
import { IMPORT_SCHEMA_DOC } from './import-schema';
import { addDays, formatGameDate } from './time';
import type { HistoryContext } from './validation';

export type PromptRequest = {
  days: number;
  startDate: string;
  startGameNumber: number;
  history: HistoryContext;
  /** cap the historical lists so the prompt stays usable */
  maxFakes?: number;
  maxRecentReal?: number;
  maxRecentDecoys?: number;
};

function sortedRecent(map: Map<string, string>, limit: number): string[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, limit)
    .map(([word]) => word.toUpperCase());
}

export function buildGenerationPrompt(request: PromptRequest): string {
  const {
    days,
    startDate,
    startGameNumber,
    history,
    maxFakes = 600,
    maxRecentReal = 900,
    maxRecentDecoys = 300,
  } = request;

  const dates = Array.from({ length: days }, (_, i) => addDays(startDate, i));
  const endDate = dates[dates.length - 1];

  const fakes = Array.from(history.usedFakeWords).sort().slice(0, maxFakes).map((w) => w.toUpperCase());
  const recentReal = sortedRecent(history.recentRealWords, maxRecentReal);
  const recentDecoys = sortedRecent(history.recentDecoys, maxRecentDecoys);

  const dateList = dates
    .map((date, index) => `  ${date}  ->  game #${String(startGameNumber + index).padStart(3, '0')}`)
    .join('\n');

  return `You are the content editor for ${BRAND.name}, a daily timed vocabulary game.

TASK
Generate ${days} complete daily games, beginning ${formatGameDate(startDate)} and ending ${formatGameDate(endDate)}.

DATES AND GAME NUMBERS (use exactly these pairings)
${dateList}

THE GAME
Each game contains exactly 10 rounds. Each round shows the player exactly five
words: four are legitimate modern English words and one is fabricated. The
player identifies the fabricated word. One selection per round, no feedback
until all ten rounds are finished. Accuracy decides ranking; time only breaks
ties.

THE MOST IMPORTANT PRINCIPLE
The fabricated word must pass the "I swear I've heard that before" test. It
obeys ordinary English spelling and phonotactics. GLORPT is a bad fake. TOVEN,
MORRENT and PLENTIC are good fakes. The fake should frequently look MORE
believable than the strangest legitimate word in the same round. That inversion
is the entire pleasure of the game.

THE INTENDED DECOY
Every round must nominate one legitimate word as the intended decoy: a real word
that players are expected to suspect. Example round:
  DEARTH · RIVEN · MORRENT · FROND · CAVIL
  fake = MORRENT, decoy = CAVIL
CAVIL is uncommon enough to look invented, but it is a real verb. That is the
trap.

WHAT COUNTS AS A REAL WORD
${BRAND_UPPER} uses a curated modern-English lexicon. Appearing somewhere in the
history of English is not sufficient. Exclude:
  - proper nouns, place names, surnames, brand names
  - abbreviations and acronyms
  - obsolete and highly archaic vocabulary
  - narrow regional dialect forms and obscure historical spellings
  - technical jargon an educated general reader would never meet
  - foreign words that have not genuinely entered English
  - intentional misspellings and internet slang
A hard word is fine if a strong crossword or vocabulary player could plausibly
encounter it. DEARTH, SINEW, FROND are fair. CAVIL is difficult but fair. BRUME
is acceptable occasionally as a hard decoy. A 14th-century Scottish spelling
found in one specialist dictionary is not fair.

FAIRNESS BALANCE PER ROUND
Aim for roughly:
  - 3 reasonably recognisable legitimate anchor words
  - 1 uncommon or suspicious legitimate word (the intended decoy)
  - 1 convincing fabrication
Never produce a round where all five words are obscure. The player should think
"I know three of these, and I'm unsure about the other two" — never "I have
never seen any of these".

DIFFICULTY CURVE (per game)
  rounds 1-3   approachable but not trivial      (difficulty 1-2)
  rounds 4-7   challenging                       (difficulty 3)
  rounds 8-9   hard                              (difficulty 4)
  round 10     very difficult but still fair     (difficulty 5)
Do not make the progression mechanically identical every day.

ROUND SHAPE
About nine of the ten rounds should be "mixed": five unrelated words that do not
rhyme or share prefixes, e.g. AJAR · AWRY · LITHE · BRUME · TOVEN.
At most ONE round per game may be a strong visual family, e.g.
TALLOW · MALLOW · FALLOW · SALLOW · NALLOW. Mark that round's type as
"visual-family" or "spelling-pattern". Pattern rounds are seasoning, not the
mechanic.

FOR EVERY ROUND SUPPLY
  - date, gameNumber, round number
  - difficulty 1-5 and round type
  - the five options, flagged real/fabricated
  - the fabricated word and the intended decoy
  - part of speech, a concise short definition and a one-or-two sentence
    expanded definition for EVERY legitimate word
  - fakeRationale: why the fabrication reads as real English
  - decoyRationale: why the legitimate decoy looks suspicious, and what it
    actually means
Write the rationales the way a good editor talks: specific, dry, interesting.
Example: "TOVEN was built to echo WOVEN and TOKEN and uses a natural English
-EN ending." / "BRUME is the trap: it looks invented, but it is a legitimate
noun meaning mist or fog, especially in cold weather."

NEVER REUSE THESE FABRICATED WORDS (${fakes.length} previously published)
${fakes.length ? fakes.join(', ') : '(none yet)'}

AVOID THESE RECENTLY USED REAL WORDS (${recentReal.length})
${recentReal.length ? recentReal.join(', ') : '(none yet)'}

AVOID THESE RECENTLY USED INTENDED DECOYS (${recentDecoys.length})
${recentDecoys.length ? recentDecoys.join(', ') : '(none yet)'}

OUTPUT
Return ONLY JSON, no commentary, no markdown fence, matching this schema:

${IMPORT_SCHEMA_DOC}

Self-check before answering:
  1. Is any "fake" a real English word, an accepted inflection, a plural, a
     surname, a place or a brand? If so, replace it.
  2. Does every round have exactly four real words and one fabrication?
  3. Does every round have three fair anchors?
  4. Is any fake reused inside this batch or present in the list above?
  5. Would an educated player reading the explanation say "I didn't know that"
     rather than "nobody calls that a word"?`;
}

export function promptFilename(startDate: string, days: number): string {
  return `${BRAND.name.toLowerCase()}-bank-${startDate}-${days}days.txt`;
}
