/**
 * Builders for the browser-safe gameplay payload.
 *
 * Pure functions, no I/O — which means the test suite can assert directly that
 * nothing here can leak is_real, a rationale, a definition or the identity of
 * the fabricated option.
 */
import { seededShuffle } from './shuffle';
import type { OptionRecord, PublicRound, RoundRecord } from './types';

function publicOptions(options: OptionRecord[]) {
  return options.map((option, index) => ({
    id: option.id,
    word: option.display_word,
    displayPosition: index + 1,
  }));
}

/** Fresh per-attempt shuffle. */
export function toPublicRounds(rounds: RoundRecord[], attemptId: string): PublicRound[] {
  return rounds
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((round) => {
      const options = (round.options ?? []) as OptionRecord[];
      return {
        roundId: round.id,
        roundNumber: round.position,
        options: publicOptions(seededShuffle(options, `${attemptId}:${round.id}`)),
      };
    });
}

/** Rebuild from the order stored on the attempt (used after a refresh). */
export function toPublicRoundsFromStoredOrder(
  rounds: RoundRecord[],
  storedOrder: Record<string, string[]>,
  attemptId: string,
): PublicRound[] {
  return rounds
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((round) => {
      const options = (round.options ?? []) as OptionRecord[];
      const order = storedOrder[round.id];
      const byId = new Map(options.map((o) => [o.id, o]));
      const ordered =
        order && order.length === options.length
          ? order
              .map((id) => byId.get(id))
              .filter((o): o is OptionRecord => Boolean(o))
          : seededShuffle(options, `${attemptId}:${round.id}`);
      return {
        roundId: round.id,
        roundNumber: round.position,
        options: publicOptions(ordered),
      };
    });
}

export function buildOptionOrder(rounds: PublicRound[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const round of rounds) out[round.roundId] = round.options.map((o) => o.id);
  return out;
}
