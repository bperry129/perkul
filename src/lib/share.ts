import { BRAND_UPPER, padGameNumber } from './brand';
import { formatElapsed } from './time';

/**
 * Spoiler-free share text. Marks only — never the words, never which option was
 * fabricated, never the round contents.
 *
 * PERKUL #001
 * 9/10 · 0:51.82
 * ✓ ✓ ✓ ✕ ✓ ✓ ✓ ✓ ✓ ✓
 * A−
 */
export function buildShareText(input: {
  gameNumber: number;
  correctCount: number;
  roundsTotal: number;
  elapsedMs: number;
  marks: boolean[];
  grade?: string | null;
  url?: string | null;
}): string {
  const lines = [
    `${BRAND_UPPER} #${padGameNumber(input.gameNumber)}`,
    `${input.correctCount}/${input.roundsTotal} · ${formatElapsed(input.elapsedMs)}`,
    input.marks.map((m) => (m ? '✓' : '✕')).join(' '),
  ];
  if (input.grade) lines.push(input.grade);
  if (input.url) lines.push(input.url);
  return lines.join('\n');
}
