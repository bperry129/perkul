/**
 * The initial 20-day content bank: games #001–#020, covering
 * 2026-07-28 (opening day) through 2026-08-16 inclusive.
 *
 * 20 games · 200 rounds · 1,000 displayed options · 200 unique fabrications.
 */
import type { DraftGame } from '../lib/content/draft';
import { GAMES_01_05 } from './games-01-05';
import { GAMES_06_10 } from './games-06-10';
import { GAMES_11_15 } from './games-11-15';
import { GAMES_16_20 } from './games-16-20';

export const SEED_GAMES: DraftGame[] = [
  ...GAMES_01_05,
  ...GAMES_06_10,
  ...GAMES_11_15,
  ...GAMES_16_20,
];

export { FIXTURE_GAME, FIXTURE_ROUND } from './fixtures';
