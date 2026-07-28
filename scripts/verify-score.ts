/**
 * Proves the Perkul score is live in the database and that Postgres and
 * TypeScript rank identically.
 *
 *   npx tsx scripts/verify-score.ts        (or: npm run verify:score)
 *
 * It inserts two clearly-flagged simulated attempts against a published game —
 * the owner's exact scenario, a perfect game that took an hour versus a fast
 * 9/10 — then reads the generated `score` column, the leaderboard ordering and
 * attempt_rank(), and deletes both rows again. Nothing is left behind.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { serviceClient } from '../src/lib/supabase/admin';
import { perkulScore, compareRanked, CORRECT_POINTS, POINTS_PER_SECOND } from '../src/lib/scoring';

const SLOW_PERFECT = { label: 'ScoreCheck-SlowPerfect', correct: 10, elapsedMs: 60 * 60 * 1000 };
const FAST_NINE = { label: 'ScoreCheck-FastNine', correct: 9, elapsedMs: 60 * 1000 };

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

type Probe = { id: string; correct_count: number; elapsed_ms: number; score: number };

async function main(): Promise<void> {
  const db = serviceClient();
  console.log(`Perkul score check (${CORRECT_POINTS} per answer, ${POINTS_PER_SECOND} per second)\n`);

  const { data: games, error: gameError } = await db
    .from('games')
    .select('id, game_number')
    .eq('status', 'published')
    .order('active_date', { ascending: false })
    .limit(1);

  if (gameError) throw new Error(`Could not read games: ${gameError.message}`);
  const game = (games ?? [])[0] as { id: string; game_number: number } | undefined;
  if (!game) throw new Error('No published game to test against. Run `npm run seed` first.');
  console.log(`Game #${game.game_number}\n`);

  const now = Date.now();
  const rows = [SLOW_PERFECT, FAST_NINE].map((spec) => ({
    id: crypto.randomUUID(),
    game_id: game.id,
    display_name_override: spec.label,
    mode: 'ranked',
    is_ranked: true,
    is_simulated: true,
    rounds_total: 10,
    started_at: new Date(now - spec.elapsedMs).toISOString(),
    completed_at: new Date(now).toISOString(),
    elapsed_ms: spec.elapsedMs,
    correct_count: spec.correct,
    completion_status: 'completed',
    integrity_status: 'valid',
  }));
  const [slowId, fastId] = rows.map((r) => r.id);

  const { error: insertError } = await db.from('attempts').insert(rows);
  if (insertError) throw new Error(`Could not insert probe attempts: ${insertError.message}`);

  try {
    /* ------------------------------------------------- the generated column */
    const { data: stored, error: storedError } = await db
      .from('attempts')
      .select('id, correct_count, elapsed_ms, score')
      .in('id', [slowId, fastId]);

    if (storedError) {
      throw new Error(
        `Could not read attempts.score (${storedError.message}). ` +
          'Apply supabase/migrations/20260728120000_score.sql first.',
      );
    }

    const probes = (stored ?? []) as Probe[];
    check('attempts.score exists', probes.every((p) => p.score != null));

    for (const probe of probes) {
      const expected = perkulScore(probe.correct_count, probe.elapsed_ms);
      check(
        `SQL score matches perkulScore() for ${probe.correct_count}/10 in ${probe.elapsed_ms}ms`,
        Number(probe.score) === expected,
        `sql=${probe.score} ts=${expected}`,
      );
    }

    const slow = probes.find((p) => p.id === slowId);
    const fast = probes.find((p) => p.id === fastId);
    check('a 10/10 that took an hour scores 0', Number(slow?.score) === 0, `got ${slow?.score}`);
    check('a 9/10 in a minute scores 8520', Number(fast?.score) === 8520, `got ${fast?.score}`);

    /* --------------------------------------------------- leaderboard_page() */
    const { data: board, error: boardError } = await db.rpc('leaderboard_page', {
      p_game_id: game.id,
      p_limit: 2000,
      p_offset: 0,
      p_include_simulated: true,
    });
    if (boardError) throw new Error(`leaderboard_page failed: ${boardError.message}`);

    const ladder = (board ?? []) as Array<{
      rank: number;
      attempt_id: string;
      correct_count: number;
      elapsed_ms: number;
      score: number | null;
    }>;

    check('leaderboard_page returns score', ladder.every((r) => r.score != null));

    const slowRank = ladder.find((r) => r.attempt_id === slowId)?.rank;
    const fastRank = ladder.find((r) => r.attempt_id === fastId)?.rank;
    check(
      'the fast 9/10 ranks above the hour-long 10/10',
      slowRank != null && fastRank != null && fastRank < slowRank,
      `fast=#${fastRank} slow=#${slowRank}`,
    );

    // The whole page must already be in the order compareRanked() would choose.
    const asRankable = ladder.map((r) => ({
      correctCount: r.correct_count,
      elapsedMs: r.elapsed_ms,
    }));
    const disagreement = asRankable.findIndex(
      (row, i) => i > 0 && compareRanked(asRankable[i - 1], row) > 0,
    );
    check(
      `SQL ordering agrees with compareRanked() across ${ladder.length} rows`,
      disagreement === -1,
      disagreement === -1 ? '' : `first disagreement at row ${disagreement + 1}`,
    );

    /* ------------------------------------------------------- attempt_rank() */
    for (const [label, id] of [
      ['fast 9/10', fastId],
      ['hour-long 10/10', slowId],
    ] as const) {
      const { data: rankData, error: rankError } = await db.rpc('attempt_rank', {
        p_attempt_id: id,
        p_include_simulated: true,
      });
      if (rankError) throw new Error(`attempt_rank failed: ${rankError.message}`);
      const row = (Array.isArray(rankData) ? rankData[0] : rankData) as
        | { rank: number; total: number }
        | undefined;
      const pageRank = ladder.find((r) => r.attempt_id === id)?.rank;
      check(
        `attempt_rank() agrees with the leaderboard page for the ${label}`,
        row != null && Number(row.rank) === Number(pageRank),
        `attempt_rank=${row?.rank} page=${pageRank}`,
      );
    }
  } finally {
    const { error: cleanupError } = await db.from('attempts').delete().in('id', [slowId, fastId]);
    console.log(
      cleanupError
        ? `\n!! Could not delete probe attempts (${cleanupError.message}). Remove ${slowId} and ${fastId} by hand.`
        : '\nProbe attempts deleted.',
    );
  }

  console.log(failures === 0 ? '\nScore ladder verified.' : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
