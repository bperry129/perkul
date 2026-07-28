/**
 * End-to-end gameplay smoke test against a running dev server.
 * Plays a real ranked attempt through the public HTTP API, asserts the answer
 * key never leaks before completion, then deletes the attempt so it does not
 * pollute the live leaderboard.
 *
 *   npx tsx scripts/smoke.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { serviceClient } from '../src/lib/supabase/admin';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';

/** Substrings that must never appear in a pre-completion payload. */
const FORBIDDEN = [
  'is_real',
  'isReal',
  'fake_option',
  'fakeOption',
  'intended_decoy',
  'intendedDecoy',
  'fake_rationale',
  'fakeRationale',
  'decoy_rationale',
  'decoyRationale',
  'short_definition',
  'shortDefinition',
  'expanded_definition',
];

let cookie = '';
let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function post(path: string, body: unknown): Promise<{ status: number; json: any; raw: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const pair = setCookie.split(';')[0];
    cookie = cookie ? `${cookie}; ${pair}` : pair;
  }
  const raw = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* non-JSON error page */
  }
  return { status: res.status, json: parsed, raw };
}

async function main() {
  console.log(`Perkul smoke test -> ${BASE}\n`);

  /* ---------------------------------------------------------------- START */
  console.log('START');
  const start = await post('/api/attempt/start', {});
  check('start returns 200', start.status === 200, `got ${start.status}: ${start.raw.slice(0, 200)}`);
  if (start.status !== 200) process.exit(1);

  const attempt = start.json.attempt;
  const attemptId: string = attempt.attemptId;
  const rounds: any[] = attempt.rounds ?? [];
  check('attempt id issued', typeof attemptId === 'string' && attemptId.length > 0);
  check('exactly 10 rounds served', rounds.length === 10, `got ${rounds.length}`);
  check(
    'every round has exactly 5 options',
    rounds.every((r) => (r.options ?? []).length === 5),
    JSON.stringify(rounds.map((r) => (r.options ?? []).length)),
  );
  check('game number is 1', attempt.game?.gameNumber === 1, String(attempt.game?.gameNumber));
  check('server start timestamp present', Boolean(attempt.startedAt), JSON.stringify(attempt.startedAt));

  const leaked = FORBIDDEN.filter((k) => start.raw.includes(k));
  check('no answer-key fields in START payload', leaked.length === 0, leaked.join(', '));

  console.log(`  (round 1 words: ${rounds[0].options.map((o: any) => o.word).join(', ')})`);

  /* --------------------------------------------------------------- ANSWERS */
  console.log('\nANSWERS (one selection per round, no feedback expected)');
  const submitted: Array<{ roundId: string; optionId: string; elapsedAtMs: number }> = [];
  let clock = 0;
  for (let i = 0; i < rounds.length; i += 1) {
    const round = rounds[i];
    // Rotate the chosen position so we exercise a mix of hits and misses.
    const pick = round.options[i % 5];
    clock += 1200 + i * 90;
    const res = await post('/api/attempt/answer', {
      attemptId,
      roundId: round.roundId,
      optionId: pick.id,
      elapsedAtMs: clock,
      roundNumber: round.roundNumber ?? i + 1,
      displayPosition: (i % 5) + 1,
    });
    if (res.status !== 200) {
      check(`round ${i + 1} accepted`, false, `${res.status} ${res.raw.slice(0, 160)}`);
      break;
    }
    const revealed = FORBIDDEN.filter((k) => res.raw.includes(k));
    if (revealed.length || /"is_?correct"|"correct":\s*(true|false)/i.test(res.raw)) {
      check(`round ${i + 1} response hides correctness`, false, res.raw.slice(0, 160));
    }
    submitted.push({ roundId: round.roundId, optionId: pick.id, elapsedAtMs: clock });
  }
  check('all 10 selections committed', submitted.length === 10, `${submitted.length}`);

  // A second selection on an already-answered round must be refused.
  const dupe = await post('/api/attempt/answer', {
    attemptId,
    roundId: rounds[0].roundId,
    optionId: rounds[0].options[4].id,
    elapsedAtMs: clock + 10,
  });
  check('second selection on same round refused', dupe.status === 409, `got ${dupe.status}`);

  /* -------------------------------------------------------------- COMPLETE */
  console.log('\nCOMPLETE');
  const done = await post('/api/attempt/complete', {
    attemptId,
    answers: submitted,
    clientElapsedMs: clock,
  });
  check('complete returns 200', done.status === 200, `got ${done.status}: ${done.raw.slice(0, 200)}`);
  if (done.status !== 200) {
    await cleanup(attemptId);
    process.exit(1);
  }

  const result = done.json.result;
  check(
    'correct count is 0..10',
    Number.isInteger(result.correctCount) && result.correctCount >= 0 && result.correctCount <= 10,
    String(result.correctCount),
  );
  check('authoritative elapsed time is server-derived', result.elapsedMs > 0 && result.elapsedMs !== clock, `server=${result.elapsedMs} client=${clock}`);
  check('grade assigned', typeof result.grade === 'string' && result.grade.length > 0, String(result.grade));
  check('per-round results returned', (result.rounds ?? []).length === 10, String((result.rounds ?? []).length));

  const firstRound = (result.rounds ?? [])[0] ?? {};
  const roundBlob = JSON.stringify(firstRound);
  check('results now reveal the fake word', /fake/i.test(roundBlob), roundBlob.slice(0, 120));
  check('results include explanation text', /rationale|why|because/i.test(roundBlob.toLowerCase()));

  console.log(
    `\n  RESULT  ${result.correctCount}/10 · ${(result.elapsedMs / 1000).toFixed(2)}s · grade ${result.grade}`,
  );

  /* ------------------------------------------------------------ IDEMPOTENCY */
  const again = await post('/api/attempt/complete', {
    attemptId,
    answers: submitted,
    clientElapsedMs: clock + 5000,
  });
  const sameScore = again.status === 200 && again.json?.result?.correctCount === result.correctCount;
  const sameTime = again.json?.result?.elapsedMs === result.elapsedMs;
  check('re-submitting is idempotent (score unchanged)', sameScore, `${again.status}`);
  check('re-submitting cannot rewrite the time', sameTime, `${again.json?.result?.elapsedMs} vs ${result.elapsedMs}`);

  await cleanup(attemptId);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

/** Remove the test attempt so the real leaderboard stays honest. */
async function cleanup(attemptId: string) {
  const db = serviceClient();
  await db.from('attempt_answers').delete().eq('attempt_id', attemptId);
  await db.from('analytics_events').delete().eq('attempt_id', attemptId);
  const { error } = await db.from('attempts').delete().eq('id', attemptId);
  console.log(`\ncleanup: attempt removed${error ? ` (failed: ${error.message})` : ''}`);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
