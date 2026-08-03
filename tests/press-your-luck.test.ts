import { describe, expect, it } from 'vitest';
import {
  bustChanceForScore,
  MAX_BUST_CHANCE,
  oddsTable,
  probabilityOfReaching,
} from '@/lib/press-your-luck-math';

describe('press your luck odds', () => {
  it('starts at 0% chance and rises 1 point per point of score', () => {
    expect(bustChanceForScore(0)).toBe(0);
    expect(bustChanceForScore(1)).toBe(1);
    expect(bustChanceForScore(20)).toBe(20);
  });

  it('never reaches certainty, however high the score climbs', () => {
    expect(bustChanceForScore(85)).toBe(MAX_BUST_CHANCE);
    expect(bustChanceForScore(1000)).toBe(MAX_BUST_CHANCE);
    expect(MAX_BUST_CHANCE).toBeLessThan(100);
  });

  it('treats negative or non-finite scores as zero chance', () => {
    expect(bustChanceForScore(-5)).toBe(0);
    expect(bustChanceForScore(Number.NaN)).toBe(0);
  });

  it('reaching score 0 is a certainty', () => {
    expect(probabilityOfReaching(0)).toBe(1);
  });

  it('the chance of reaching a higher score is strictly smaller', () => {
    const p10 = probabilityOfReaching(10);
    const p20 = probabilityOfReaching(20);
    expect(p20).toBeLessThan(p10);
    expect(p10).toBeLessThan(1);
    expect(p10).toBeGreaterThan(0);
  });

  it('the odds table is monotonically decreasing in reach chance', () => {
    const rows = oddsTable([10, 20, 30]);
    expect(rows[0].reachChancePercent).toBeGreaterThan(rows[1].reachChancePercent);
    expect(rows[1].reachChancePercent).toBeGreaterThan(rows[2].reachChancePercent);
  });

  it('the odds table reports the correct bust chance alongside each score', () => {
    const [row] = oddsTable([42]);
    expect(row.bustChance).toBe(42);
  });
});
