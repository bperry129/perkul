/**
 * Brand constants. The game was drafted internally as "FALSE" and ships as
 * "Perkul". Everything user facing reads from here so a rename is a one-line
 * change (or an env var) rather than a refactor.
 */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Perkul',
  domain: 'perkul.com',
  internalCodename: 'FALSE',
  tagline: 'One of these words isn’t real.',
  subline: '10 rounds. 5 words each. Choose the fake.',
  rule: 'Accuracy wins. Speed breaks ties.',
  timezone: 'America/New_York',
  firstGameDate: '2026-07-28',
  roundsPerGame: 10,
  optionsPerRound: 5,
} as const;

export const BRAND_UPPER = BRAND.name.toUpperCase();

/** "PERKUL #001" */
export function gameLabel(gameNumber: number): string {
  return `${BRAND_UPPER} #${padGameNumber(gameNumber)}`;
}

export function padGameNumber(gameNumber: number): string {
  return String(gameNumber).padStart(3, '0');
}

export function siteUrl(path = ''): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${path}`;
}
