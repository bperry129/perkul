/**
 * Seeds the initial 20-day bank into Supabase.
 *
 *   npm run seed            # insert games that do not exist yet
 *   npm run seed:reset      # replace games on the same dates
 *   npm run seed -- --draft # import as needs_review instead of published
 *
 * Real words are ingested into the curated lexicon as part of the write, so the
 * "is this a word?" question always has a database answer.
 */
import { config } from 'dotenv';
import { SEED_GAMES } from '../src/content';
import { validateBank, EMPTY_HISTORY } from '../src/lib/validation';
import { normalizeWord } from '../src/lib/content/draft';
import { saveDraftGames } from '../src/lib/persist';
import { isSupabaseConfigured } from '../src/lib/supabase/admin';

config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  const args = process.argv.slice(2);
  const overwrite = args.includes('--reset');
  const asDraft = args.includes('--draft');
  const force = args.includes('--force');

  if (!isSupabaseConfigured()) {
    console.error(
      'Supabase is not configured. Create .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
    process.exit(1);
  }

  const accepted = new Set<string>();
  for (const game of SEED_GAMES) {
    for (const round of game.rounds) {
      for (const option of round.options) {
        if (option.isReal) accepted.add(normalizeWord(option.word));
      }
    }
  }

  const { reports, ok } = validateBank(SEED_GAMES, {
    ...EMPTY_HISTORY,
    acceptedLexicon: accepted,
  });

  const errorCount = reports.reduce((total, r) => total + r.report.errors.length, 0);
  const warningCount = reports.reduce((total, r) => total + r.report.warnings.length, 0);

  console.log(`Validating ${SEED_GAMES.length} games: ${errorCount} errors, ${warningCount} warnings.`);

  if (!ok && !force) {
    for (const { game, report } of reports) {
      for (const issue of report.errors) {
        console.error(`  #${game.gameNumber} ${game.activeDate}: ${issue.message}`);
      }
    }
    console.error('Refusing to seed invalid content. Run `npm run content:check` for detail.');
    process.exit(1);
  }

  const outcome = await saveDraftGames(SEED_GAMES, {
    status: asDraft ? 'needs_review' : 'published',
    overwrite,
    approveRounds: !asDraft,
  });

  console.log('');
  console.log(`created            ${outcome.created}`);
  console.log(`replaced           ${outcome.replaced}`);
  console.log(`lexicon entries    ${outcome.lexiconWords}`);
  if (outcome.skipped.length) {
    console.log('skipped:');
    for (const skip of outcome.skipped) console.log(`  ${skip.activeDate} — ${skip.reason}`);
    console.log('Re-run with --reset to replace those dates.');
  }
  console.log('');
  console.log(
    asDraft
      ? 'Imported as needs_review. Publish from /admin/games when you are happy.'
      : 'Published. The New York calendar date now selects the live game automatically.',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
