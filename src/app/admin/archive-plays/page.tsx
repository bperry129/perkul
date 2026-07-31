import Link from 'next/link';
import { serviceClient } from '@/lib/supabase/admin';
import { formatElapsed, formatGameDateShort, nyDateString } from '@/lib/time';
import { padGameNumber } from '@/lib/brand';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  user_id: string | null;
  anonymous_session_id: string | null;
  correct_count: number | null;
  rounds_total: number | null;
  elapsed_ms: number | null;
  completed_at: string;
  games: { game_number: number; active_date: string } | { game_number: number; active_date: string }[];
};

/**
 * ARCHIVE PLAYS — who is replaying which past puzzles, and how often.
 *
 * "Unranked" alone is not the same thing as "archive": a practice replay of
 * TODAY's game is also unranked. An archive play is an unranked attempt finished
 * on a later calendar day than the puzzle it belongs to, so that is the test
 * applied here rather than a plain `is_ranked = false` count.
 */
export default async function AdminArchivePlaysPage() {
  const db = serviceClient();
  const today = nyDateString();

  const { data } = await db
    .from('attempts')
    .select(
      'id, user_id, anonymous_session_id, correct_count, rounds_total, elapsed_ms, completed_at, games!inner(game_number, active_date)',
    )
    .eq('is_ranked', false)
    .eq('is_simulated', false)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(2000);

  const all = (data ?? []) as unknown as Row[];

  // Keep only genuine archive plays: the puzzle's day is before the day it was played.
  const plays = all
    .map((row) => {
      const game = Array.isArray(row.games) ? row.games[0] : row.games;
      return { ...row, game };
    })
    .filter((row) => {
      if (!row.game) return false;
      const playedOn = nyDateString(new Date(row.completed_at));
      return row.game.active_date < playedOn;
    });

  // Names for every signed-in player involved.
  const userIds = Array.from(new Set(plays.map((p) => p.user_id).filter(Boolean))) as string[];
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await db
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', userIds);
    for (const p of (profiles ?? []) as Array<{ user_id: string; display_name: string | null }>) {
      if (p.display_name) names.set(p.user_id, p.display_name);
    }
  }

  const labelFor = (row: { user_id: string | null; anonymous_session_id: string | null }) =>
    row.user_id
      ? names.get(row.user_id) ?? `user ${row.user_id.slice(0, 8)}`
      : `guest ${(row.anonymous_session_id ?? '').slice(0, 8)}`;

  // Per player.
  const byPlayer = new Map<
    string,
    { label: string; registered: boolean; plays: number; games: Set<number>; last: string }
  >();
  // Per game.
  const byGame = new Map<
    number,
    { gameNumber: number; activeDate: string; plays: number; players: Set<string> }
  >();
  // Per player × game — the "how many times" matrix.
  const byPair = new Map<
    string,
    { label: string; gameNumber: number; activeDate: string; plays: number; last: string }
  >();

  for (const row of plays) {
    const key = row.user_id ?? `anon:${row.anonymous_session_id}`;
    const label = labelFor(row);
    const gameNumber = row.game.game_number;

    const player = byPlayer.get(key);
    if (player) {
      player.plays += 1;
      player.games.add(gameNumber);
    } else {
      byPlayer.set(key, {
        label,
        registered: Boolean(row.user_id),
        plays: 1,
        games: new Set([gameNumber]),
        last: row.completed_at,
      });
    }

    const game = byGame.get(gameNumber);
    if (game) {
      game.plays += 1;
      game.players.add(key);
    } else {
      byGame.set(gameNumber, {
        gameNumber,
        activeDate: row.game.active_date,
        plays: 1,
        players: new Set([key]),
      });
    }

    const pairKey = `${key}::${gameNumber}`;
    const pair = byPair.get(pairKey);
    if (pair) {
      pair.plays += 1;
    } else {
      byPair.set(pairKey, {
        label,
        gameNumber,
        activeDate: row.game.active_date,
        plays: 1,
        last: row.completed_at,
      });
    }
  }

  const players = Array.from(byPlayer.values()).sort((a, b) => b.plays - a.plays);
  const games = Array.from(byGame.values()).sort((a, b) => b.plays - a.plays);
  const pairs = Array.from(byPair.values()).sort(
    (a, b) => b.plays - a.plays || b.last.localeCompare(a.last),
  );

  const totalPlays = plays.length;
  const replayed = pairs.filter((p) => p.plays > 1).length;

  return (
    <div>
      <h1 className="admin-title">Archive plays</h1>
      <p className="label">
        Completed games on past puzzles, newest data first. Excludes simulated players and excludes
        same-day practice replays — an archive play is an unranked attempt finished after the
        puzzle&apos;s own day. Reads the most recent 2,000 unranked attempts. Today is {today}.
      </p>

      <div className="stat-grid" style={{ marginTop: '1.2rem' }}>
        <div>
          <div className="stat__value">{totalPlays}</div>
          <span className="stat__label">Archive plays</span>
        </div>
        <div>
          <div className="stat__value">{players.length}</div>
          <span className="stat__label">Players</span>
        </div>
        <div>
          <div className="stat__value">{games.length}</div>
          <span className="stat__label">Games touched</span>
        </div>
        <div>
          <div className="stat__value">{replayed}</div>
          <span className="stat__label">Repeated (same game 2×+)</span>
        </div>
      </div>

      {totalPlays === 0 ? (
        <p className="standfirst" style={{ marginTop: '2rem' }}>
          No archive plays recorded yet. Once players start replaying past puzzles from{' '}
          <Link href="/archive">the archive</Link>, they appear here.
        </p>
      ) : (
        <>
          <h2 className="admin-title" style={{ fontSize: '1.2rem', marginTop: '2.5rem' }}>
            Who plays the archive
          </h2>
          <table className="board">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Type</th>
                <th scope="col">Plays</th>
                <th scope="col">Distinct games</th>
              </tr>
            </thead>
            <tbody>
              {players.slice(0, 100).map((p) => (
                <tr key={`${p.label}-${p.last}`}>
                  <td className="board__name">{p.label}</td>
                  <td>
                    <span className="label">{p.registered ? 'account' : 'guest'}</span>
                  </td>
                  <td>{p.plays}</td>
                  <td>{p.games.size}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="admin-title" style={{ fontSize: '1.2rem', marginTop: '2.5rem' }}>
            Most replayed puzzles
          </h2>
          <table className="board">
            <thead>
              <tr>
                <th scope="col">Game</th>
                <th scope="col">Date</th>
                <th scope="col">Plays</th>
                <th scope="col">Players</th>
              </tr>
            </thead>
            <tbody>
              {games.slice(0, 100).map((g) => (
                <tr key={g.gameNumber}>
                  <td className="board__name">
                    <Link className="board__link" href={`/archive/${g.activeDate}`}>
                      #{padGameNumber(g.gameNumber)}
                    </Link>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
                    {formatGameDateShort(g.activeDate)}
                  </td>
                  <td>{g.plays}</td>
                  <td>{g.players.size}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="admin-title" style={{ fontSize: '1.2rem', marginTop: '2.5rem' }}>
            Player × game
          </h2>
          <p className="label">Which player played which puzzle, and how many times.</p>
          <table className="board">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Game</th>
                <th scope="col">Date</th>
                <th scope="col">Times</th>
              </tr>
            </thead>
            <tbody>
              {pairs.slice(0, 300).map((p) => (
                <tr key={`${p.label}-${p.gameNumber}`}>
                  <td className="board__name">{p.label}</td>
                  <td>#{padGameNumber(p.gameNumber)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
                    {formatGameDateShort(p.activeDate)}
                  </td>
                  <td>{p.plays}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="admin-title" style={{ fontSize: '1.2rem', marginTop: '2.5rem' }}>
            Latest archive plays
          </h2>
          <table className="board">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Game</th>
                <th scope="col">Score</th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {plays.slice(0, 100).map((row) => (
                <tr key={row.id}>
                  <td className="board__name">{labelFor(row)}</td>
                  <td>#{padGameNumber(row.game.game_number)}</td>
                  <td>
                    {row.correct_count ?? 0}/{row.rounds_total ?? 10}
                  </td>
                  <td>{formatElapsed(row.elapsed_ms ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
