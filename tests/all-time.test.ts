import { describe, expect, it } from 'vitest';
import {
  MIN_GAMES_FOR_AVERAGE,
  compareAllTime,
  minGamesFor,
  rankAllTime,
} from '@/lib/all-time-rank';
import { perkulScore } from '@/lib/scoring';

type Row = {
  rank: number;
  displayName: string;
  gamesPlayed: number;
  totalScore: number;
  averageScore: number;
};

/** Build a standing from a list of per-game scores. */
function player(displayName: string, scores: number[]): Row {
  const totalScore = scores.reduce((a, b) => a + b, 0);
  return {
    rank: 0,
    displayName,
    gamesPlayed: scores.length,
    totalScore,
    averageScore: scores.length ? totalScore / scores.length : 0,
  };
}

const fill = (games: number, score: number) => Array.from({ length: games }, () => score);

describe('all-time: smartest players (average score)', () => {
  it('ranks a good occasional player above a mediocre daily player', () => {
    // The whole point of the board: attendance is not skill.
    const occasional = player('occasional', fill(6, 9_000)); //  54,000 total
    const grinder = player('grinder', fill(20, 6_000)); //      120,000 total
    const board = rankAllTime([grinder, occasional], 'average');
    expect(board.map((r) => r.displayName)).toEqual(['occasional', 'grinder']);
    expect(board[0].rank).toBe(1);
  });

  it(`hides players with fewer than ${MIN_GAMES_FOR_AVERAGE} games`, () => {
    const oneLuckyGame = player('flash', [9_900]);
    const fourGames = player('almost', fill(MIN_GAMES_FOR_AVERAGE - 1, 9_800));
    const qualified = player('regular', fill(MIN_GAMES_FOR_AVERAGE, 7_000));

    const board = rankAllTime([oneLuckyGame, fourGames, qualified], 'average');
    expect(board.map((r) => r.displayName)).toEqual(['regular']);
    expect(minGamesFor('average')).toBe(MIN_GAMES_FOR_AVERAGE);
  });

  it('admits a player on exactly the minimum number of games', () => {
    const board = rankAllTime([player('exactly', fill(MIN_GAMES_FOR_AVERAGE, 5_000))], 'average');
    expect(board).toHaveLength(1);
    expect(board[0].gamesPlayed).toBe(MIN_GAMES_FOR_AVERAGE);
  });

  it('breaks an equal average in favour of the longer record', () => {
    const few = player('few', fill(5, 8_000));
    const many = player('many', fill(15, 8_000));
    expect(compareAllTime('average', many, few)).toBeLessThan(0);
    expect(rankAllTime([few, many], 'average')[0].displayName).toBe('many');
  });
});

describe('all-time: total points', () => {
  it('ranks by accumulated points, so volume is rewarded', () => {
    const occasional = player('occasional', fill(6, 9_000)); //  54,000
    const grinder = player('grinder', fill(20, 6_000)); //      120,000
    const board = rankAllTime([occasional, grinder], 'total');
    expect(board.map((r) => r.displayName)).toEqual(['grinder', 'occasional']);
  });

  it('has no games-played minimum — one game still counts', () => {
    expect(minGamesFor('total')).toBe(1);
    const board = rankAllTime([player('newcomer', [4_200])], 'total');
    expect(board).toHaveLength(1);
    expect(board[0].totalScore).toBe(4_200);
  });

  it('breaks an equal total in favour of fewer games', () => {
    const efficient = player('efficient', fill(5, 8_000)); // 40,000 in 5
    const plodding = player('plodding', fill(10, 4_000)); //  40,000 in 10
    expect(compareAllTime('total', efficient, plodding)).toBeLessThan(0);
    expect(rankAllTime([plodding, efficient], 'total')[0].displayName).toBe('efficient');
  });

  it('ranks the same field differently from the average board', () => {
    const field = [player('occasional', fill(6, 9_000)), player('grinder', fill(20, 6_000))];
    const smartest = rankAllTime(field, 'average').map((r) => r.displayName);
    const points = rankAllTime(field, 'total').map((r) => r.displayName);
    expect(smartest).not.toEqual(points);
  });
});

describe('all-time: built on the daily Perkul score', () => {
  it('accumulates the same per-game score the daily board sorts on', () => {
    const games: Array<[number, number]> = [
      [10, 60_000],
      [9, 75_000],
      [10, 90_000],
      [8, 55_000],
      [10, 48_000],
    ];
    const scores = games.map(([correct, ms]) => perkulScore(correct, ms));
    const row = player('me', scores);

    expect(row.gamesPlayed).toBe(MIN_GAMES_FOR_AVERAGE);
    expect(row.totalScore).toBe(scores.reduce((a, b) => a + b, 0));
    expect(row.averageScore).toBeCloseTo(row.totalScore / MIN_GAMES_FOR_AVERAGE, 6);
    // A slow perfect game still cannot inflate a total beyond the score rule.
    expect(perkulScore(10, 3_600_000)).toBe(0);
  });

  it('never produces a negative total', () => {
    const row = player('slowpoke', fill(5, perkulScore(10, 60 * 60 * 1000)));
    expect(row.totalScore).toBe(0);
    expect(row.averageScore).toBe(0);
  });
});
