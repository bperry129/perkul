/**
 * Offline validation of the authored seed bank. No database required.
 *
 *   npm run content:check
 *
 * This is the same validator the admin UI runs, so content that passes here
 * will publish cleanly.
 */
import { SEED_GAMES } from '../src/content';
import { summarizeBank, validateBank, EMPTY_HISTORY } from '../src/lib/validation';
import { normalizeWord } from '../src/lib/content/draft';

function main() {
  const summary = summarizeBank(SEED_GAMES);

  console.log('PERKUL seed bank');
  console.log('----------------');
  console.log(`games                ${summary.games}`);
  console.log(`rounds               ${summary.rounds}`);
  console.log(`displayed options    ${summary.options}`);
  console.log(`unique real words    ${summary.uniqueRealWords}`);
  console.log(`fabrications         ${summary.fakes}`);
  console.log(`dates                ${summary.dates[0]} → ${summary.dates[summary.dates.length - 1]}`);
  console.log('');

  // The accepted lexicon starts from the real words in the bank itself, so a
  // fabrication colliding with any real word anywhere in the bank is caught.
  const accepted = new Set<string>();
  for (const game of SEED_GAMES) {
    for (const round of game.rounds) {
      for (const option of round.options) {
        if (option.isReal) accepted.add(normalizeWord(option.word));
      }
    }
  }

  const { reports } = validateBank(SEED_GAMES, { ...EMPTY_HISTORY, acceptedLexicon: accepted });

  let errors = 0;
  let warnings = 0;

  for (const { game, report } of reports) {
    if (report.errors.length === 0 && report.warnings.length === 0) continue;
    console.log(`#${String(game.gameNumber).padStart(3, '0')}  ${game.activeDate}`);
    for (const issue of report.errors) {
      errors += 1;
      console.log(`   ERROR   ${issue.message}`);
    }
    for (const issue of report.warnings) {
      warnings += 1;
      console.log(`   warning ${issue.message}`);
    }
    console.log('');
  }

  console.log(`${errors} error(s), ${warnings} warning(s).`);
  if (errors > 0) {
    console.log('Fix the errors above before seeding: publication is blocked while they exist.');
    process.exit(1);
  }
  console.log('Seed bank is publishable. Warnings are editorial judgement calls.');
}

main();
