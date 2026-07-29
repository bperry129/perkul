/**
 * Brand constants. The game was drafted internally as "FALSE" and ships as
 * "Perkul". Everything user facing reads from here so a rename is a one-line
 * change (or an env var) rather than a refactor.
 */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Perkul',
  domain: 'perkul.com',
  /**
   * The one contact address. Terms, Privacy and the footer all read it from
   * here: a legal page promising to answer an address nobody reads is worse
   * than having no address, and three hard-coded copies is how that happens.
   */
  email: 'info@contact.perkul.com',

  internalCodename: 'FALSE',
  tagline: 'One of these words isn’t real.',
  subline: '10 rounds. 5 words each. Choose the fake word.',
  /** The competitive promise, in one line. */
  rule: 'Most right, fastest, wins.',
  cadence: 'One new quiz per day. Updated at 12:00 AM ET.',
  timezone: 'America/New_York',
  firstGameDate: '2026-07-28',
  roundsPerGame: 10,
  optionsPerRound: 5,
  /**
   * Public game numbering starts here. The first published date is game #210
   * rather than #001 — the archive numbering is cosmetic and deliberately
   * offset. active_date remains the real identity of a game.
   */
  firstGameNumber: 210,
} as const;

export const BRAND_UPPER = BRAND.name.toUpperCase();

/** "PERKUL #210" */
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
