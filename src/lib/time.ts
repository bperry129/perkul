/**
 * All daily-game scheduling is anchored to the America/New_York calendar date.
 * No hard-coded UTC offsets: EST/EDT is resolved through the IANA database via
 * Intl, so DST boundaries are handled automatically.
 */
export const GAME_TIMEZONE = 'America/New_York';

const isoParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: GAME_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const fullParts = new Intl.DateTimeFormat('en-US', {
  timeZone: GAME_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** YYYY-MM-DD in New York for the given instant. */
export function nyDateString(at: Date = new Date()): string {
  const parts = isoParts.formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Offset (ms) that must be added to a UTC clock reading to get NY wall time. */
export function nyOffsetMs(at: Date): number {
  const parts = fullParts.formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The exact instant of 12:00:00 AM New York on the given calendar date. */
export function nyMidnightInstant(dateString: string): Date {
  const naive = Date.parse(`${dateString}T00:00:00Z`);
  if (Number.isNaN(naive)) throw new Error(`Invalid date string: ${dateString}`);
  let ts = naive;
  // Two fixed-point iterations resolve any DST edge correctly.
  for (let i = 0; i < 3; i += 1) {
    const offset = nyOffsetMs(new Date(ts));
    ts = naive - offset;
  }
  return new Date(ts);
}

export function addDays(dateString: string, days: number): string {
  const base = Date.parse(`${dateString}T12:00:00Z`);
  const next = new Date(base + days * 86_400_000);
  return next.toISOString().slice(0, 10);
}

export function diffDays(fromDateString: string, toDateString: string): number {
  const a = Date.parse(`${fromDateString}T12:00:00Z`);
  const b = Date.parse(`${toDateString}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Milliseconds until the next New York midnight (i.e. the next daily game). */
export function msUntilNextNyMidnight(at: Date = new Date()): number {
  const tomorrow = addDays(nyDateString(at), 1);
  return nyMidnightInstant(tomorrow).getTime() - at.getTime();
}

/** 0:54.27 — minutes, seconds, hundredths. */
export function formatElapsed(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/** 51.82 SECONDS style value for the results headline. */
export function formatSeconds(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return (Math.round(ms) / 1000).toFixed(2);
}

/** 08:17:42 countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

const longDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const shortDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});

/** "July 28, 2026" from a plain YYYY-MM-DD (no timezone shifting). */
export function formatGameDate(dateString: string): string {
  return longDate.format(new Date(`${dateString}T00:00:00Z`));
}

/** "Jul 28" */
export function formatGameDateShort(dateString: string): string {
  return shortDate.format(new Date(`${dateString}T00:00:00Z`));
}
