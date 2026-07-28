import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  formatCountdown,
  formatElapsed,
  formatGameDate,
  msUntilNextNyMidnight,
  nyDateString,
  nyMidnightInstant,
} from '@/lib/time';

describe('New York daily scheduling', () => {
  it('resolves the New York calendar date, not the UTC date', () => {
    // 03:30 UTC on 29 July is still 23:30 on 28 July in New York (EDT).
    expect(nyDateString(new Date('2026-07-29T03:30:00Z'))).toBe('2026-07-28');
    // 04:30 UTC has crossed midnight in New York.
    expect(nyDateString(new Date('2026-07-29T04:30:00Z'))).toBe('2026-07-29');
  });

  it('switches the daily game exactly at midnight New York', () => {
    const justBefore = new Date('2026-07-29T03:59:59Z');
    const justAfter = new Date('2026-07-29T04:00:00Z');
    expect(nyDateString(justBefore)).toBe('2026-07-28');
    expect(nyDateString(justAfter)).toBe('2026-07-29');
  });

  it('computes midnight instants during EDT (UTC-4)', () => {
    expect(nyMidnightInstant('2026-07-28').toISOString()).toBe('2026-07-28T04:00:00.000Z');
  });

  it('computes midnight instants during EST (UTC-5)', () => {
    expect(nyMidnightInstant('2026-01-15').toISOString()).toBe('2026-01-15T05:00:00.000Z');
  });

  it('handles the spring-forward DST boundary', () => {
    // 2026-03-08 is the US spring-forward date.
    expect(nyMidnightInstant('2026-03-08').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(nyMidnightInstant('2026-03-09').toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(nyDateString(new Date('2026-03-08T06:30:00Z'))).toBe('2026-03-08');
  });

  it('handles the autumn fall-back DST boundary', () => {
    // 2026-11-01 is the US fall-back date.
    expect(nyMidnightInstant('2026-11-01').toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(nyMidnightInstant('2026-11-02').toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('counts down to the next New York midnight without DST drift', () => {
    const at = new Date('2026-11-01T03:00:00Z'); // 23:00 on 31 Oct in New York
    const remaining = msUntilNextNyMidnight(at);
    expect(remaining).toBe(60 * 60 * 1000);
  });

  it('walks dates without timezone slippage', () => {
    expect(addDays('2026-07-28', 19)).toBe('2026-08-16');
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-07-28', '2026-08-16')).toBe(19);
  });

  it('formats the timer to hundredths', () => {
    expect(formatElapsed(54_270)).toBe('0:54.27');
    expect(formatElapsed(72_450)).toBe('1:12.45');
    expect(formatElapsed(31_820)).toBe('0:31.82');
    expect(formatElapsed(600_000)).toBe('10:00.00');
  });

  it('formats the countdown as hh:mm:ss', () => {
    expect(formatCountdown(29_862_000)).toBe('08:17:42');
  });

  it('formats a game date from a plain YYYY-MM-DD', () => {
    expect(formatGameDate('2026-07-28')).toBe('July 28, 2026');
  });
});
