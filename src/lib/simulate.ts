import 'server-only';
import { serviceClient } from './supabase/admin';
import { getGameWithRounds } from './games';
import { getActiveBenchmark } from './attempts';
import {
  DEFAULT_BENCHMARK_DISTRIBUTION,
  sampleBenchmarkAttempt,
  type BenchmarkDistribution,
} from './benchmark';
import { mulberry32, hashString, seededShuffle } from './shuffle';

/**
 * QA / development only.
 *
 * Generates clearly flagged simulated attempts (is_simulated = true) so we can
 * exercise pagination, rank maths, percentiles and leaderboard performance at
 * realistic scale. Production UI filters these out unless an administrator
 * explicitly enables the simulated-data flag.
 */
const FIRST = [
  'Lexicon', 'Word', 'Brume', 'Cavil', 'Frond', 'Sinew', 'Dearth', 'Riven',
  'Crossword', 'Anagram', 'Etymo', 'Glyph', 'Serif', 'Rubric', 'Proof',
  'Margin', 'Folio', 'Quire', 'Ligature', 'Kerning',
];
const SECOND = [
  'King', 'Nerd', 'Boy', 'Hunter', 'Dad', 'Mom', 'Fiend', 'Hound', 'Smith',
  'Wright', 'Reader', 'Setter', 'Sleuth', 'Owl', 'Fox', 'Cat', 'Ghost',
  'Machine', 'Pilgrim', 'Scribe',
];

function simulatedName(rand: () => number, index: number): string {
  const a = FIRST[Math.floor(rand() * FIRST.length)];
  const b = SECOND[Math.floor(rand() * SECOND.length)];
  return `${a}${b}${index % 97}`;
}

export type SimulationResult = {
  attempts: number;
  answers: number;
};

export async function generateSimulatedAttempts(
  gameId: string,
  count: number,
  seedInput?: string,
): Promise<SimulationResult> {
  const game = await getGameWithRounds(gameId);
  if (!game || !(game.rounds ?? []).length) {
    throw new Error('That game has no rounds to simulate against.');
  }

  const benchmark = await getActiveBenchmark();
  const distribution: BenchmarkDistribution =
    benchmark?.distribution ?? DEFAULT_BENCHMARK_DISTRIBUTION;

  const seed = hashString(`${seedInput ?? 'perkul-sim'}:${gameId}:${count}`);
  const rand = mulberry32(seed);
  const rounds = (game.rounds ?? []).slice().sort((a, b) => a.position - b.position);
  const db = serviceClient();

  const now = Date.now();
  const attemptRows: Record<string, unknown>[] = [];
  const plans: Array<{ id: string; wrongRounds: Set<string>; elapsedMs: number }> = [];

  for (let i = 0; i < count; i += 1) {
    const { correct, elapsedMs } = sampleBenchmarkAttempt(rand, distribution);
    const id = crypto.randomUUID();
    const missCount = Math.max(0, rounds.length - correct);
    // Later rounds are missed more often, matching the difficulty curve.
    const weighted = seededShuffle(
      rounds.flatMap((r) => Array.from({ length: r.difficulty }, () => r.id)),
      `${id}:miss`,
    );
    const wrongRounds = new Set<string>();
    for (const roundId of weighted) {
      if (wrongRounds.size >= missCount) break;
      wrongRounds.add(roundId);
    }

    const startedAt = new Date(now - elapsedMs - Math.floor(rand() * 3_600_000));
    attemptRows.push({
      id,
      game_id: gameId,
      user_id: null,
      anonymous_session_id: null,
      display_name_override: simulatedName(rand, i),
      mode: 'ranked',
      is_ranked: true,
      is_simulated: true,
      rounds_total: rounds.length,
      started_at: startedAt.toISOString(),
      completed_at: new Date(startedAt.getTime() + elapsedMs).toISOString(),
      elapsed_ms: elapsedMs,
      correct_count: rounds.length - wrongRounds.size,
      completion_status: 'completed',
      integrity_status: 'valid',
      option_order: {},
    });
    plans.push({ id, wrongRounds, elapsedMs });
  }

  let inserted = 0;
  const chunk = 500;
  for (let i = 0; i < attemptRows.length; i += chunk) {
    const { error } = await db.from('attempts').insert(attemptRows.slice(i, i + chunk));
    if (error) throw new Error(`Simulation failed: ${error.message}`);
    inserted += Math.min(chunk, attemptRows.length - i);
  }

  const answerRows: Record<string, unknown>[] = [];
  for (const plan of plans) {
    let running = 0;
    for (const round of rounds) {
      const options = round.options ?? [];
      const fakeId = round.fake_option_id;
      const decoyId = round.intended_decoy_option_id;
      const wrong = plan.wrongRounds.has(round.id);

      let selected = fakeId ?? options[0]?.id;
      if (wrong) {
        // Most wrong answers land on the intended decoy — that is its job.
        const others = options.filter((o) => o.id !== fakeId);
        const preferDecoy = rand() < 0.55 && decoyId;
        selected = preferDecoy
          ? (decoyId as string)
          : others[Math.floor(rand() * Math.max(1, others.length))]?.id ?? others[0]?.id;
      }
      if (!selected) continue;

      const share = plan.elapsedMs / rounds.length;
      const response = Math.max(600, Math.round(share * (0.5 + rand())));
      running += response;
      answerRows.push({
        attempt_id: plan.id,
        round_id: round.id,
        selected_option_id: selected,
        display_position: 1 + Math.floor(rand() * 5),
        elapsed_at_ms: running,
        response_elapsed_ms: response,
        is_correct: selected === fakeId,
      });
    }
  }

  for (let i = 0; i < answerRows.length; i += 1000) {
    const { error } = await db.from('attempt_answers').insert(answerRows.slice(i, i + 1000));
    if (error) throw new Error(`Simulation answers failed: ${error.message}`);
  }

  return { attempts: inserted, answers: answerRows.length };
}

export async function deleteSimulatedAttempts(gameId?: string | null): Promise<number> {
  const db = serviceClient();
  let query = db.from('attempts').delete({ count: 'exact' }).eq('is_simulated', true);
  if (gameId) query = query.eq('game_id', gameId);
  const { count, error } = await query;
  if (error) throw new Error(`Could not delete simulated data: ${error.message}`);
  return count ?? 0;
}

export async function countSimulatedAttempts(gameId?: string | null): Promise<number> {
  let query = serviceClient()
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('is_simulated', true);
  if (gameId) query = query.eq('game_id', gameId);
  const { count } = await query;
  return count ?? 0;
}
