/**
 * Development-only fixture from the product brief. It exercises the explanation
 * system end to end and is deliberately NOT part of any published daily game.
 */
import { buildGame } from './format';

export const FIXTURE_GAME = buildGame({
  date: '2000-01-01',
  gameNumber: 999,
  label: 'Development fixture',
  rounds: [
    [
      3,
      'mixed',
      [
        'AJAR|adj|slightly open',
        'AWRY|adv|turned or twisted to one side; not as planned',
        'LITHE|adj|supple, flexible and graceful',
        '^BRUME|n|mist or fog, especially in cold or wintry conditions|A literary noun for heavy winter mist. It looks invented because almost nobody meets it outside poetry.',
        '*TOVEN',
      ],
      'TOVEN was created to resemble natural English words such as WOVEN and TOKEN while using a familiar -EN ending.',
      'BRUME is the intended trap: although unusual-looking, BRUME is a legitimate noun referring to mist or fog.',
    ],
  ],
});

export const FIXTURE_ROUND = FIXTURE_GAME.rounds[0];
