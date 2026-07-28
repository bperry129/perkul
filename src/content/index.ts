/**
 * The initial 20-day content bank: games #210–#229, covering
 * 2026-07-28 (opening day) through 2026-08-16 inclusive.
 *
 * 20 games · 200 rounds · 1,000 displayed options · 200 unique fabrications.
 *
 * The individual game files use sequential internal numbers (1–20). This
 * module overwrites them with the real public-facing game numbers using
 * BRAND.firstGameNumber so the seeder and admin tools always show #210–#229.
 * To shift the starting number in future, change BRAND.firstGameNumber.
 */
import type { DraftGame } from '../lib/content/draft';
import { BRAND } from '../lib/brand';
import { GAMES_01_05 } from './games-01-05';
import { GAMES_06_10 } from './games-06-10';
import { GAMES_11_15 } from './games-11-15';
import { GAMES_16_20 } from './games-16-20';

const allGames: DraftGame[] = [
  ...GAMES_01_05,
  ...GAMES_06_10,
  ...GAMES_11_15,
  ...GAMES_16_20,
];

export const SEED_GAMES: DraftGame[] = allGames.map((game, index) => ({
  ...game,
  gameNumber: BRAND.firstGameNumber + index,
}));

export { FIXTURE_GAME, FIXTURE_ROUND } from './fixtures';
