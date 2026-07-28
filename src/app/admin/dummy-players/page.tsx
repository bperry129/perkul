import { getFlags, FLAG_DEFAULTS } from '@/lib/flags';
import { countSimulatedAttempts } from '@/lib/simulate';
import { listGameBank } from '@/lib/games';
import { toggleFlagAction, generateAllSimulatedAction, deleteSimulatedAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function DummyPlayersPage() {
  const [flags, totalDummies, games] = await Promise.all([
    getFlags(),
    countSimulatedAttempts(),
    listGameBank(),
  ]);

  const enabled =
    (flags.simulated_data?.enabled ?? FLAG_DEFAULTS.simulated_data);

  const publishedGames = games.filter((g) => g.status === 'published' || g.derived === 'live' || g.derived === 'expired');
  const gamesWithDummies = publishedGames.filter((g) => g.approved_rounds > 0);

  return (
    <div>
      <h1 className="admin-title">Dummy Players</h1>
      <p style={{ color: 'var(--ink-soft)', maxWidth: '42rem', marginBottom: '2rem' }}>
        Dummy players are simulated entries that fill out the leaderboard until enough real players
        exist. They use the same scoring formula as real players and are clearly marked{' '}
        <code>is_simulated = true</code> in the database. Real players always rank alongside them
        when this is on.
      </p>

      {/* --------------------------------------------------------- Big toggle */}
      <div
        style={{
          padding: '1.5rem',
          background: enabled ? 'var(--panel)' : 'var(--paper-deep)',
          color: enabled ? 'var(--paper)' : 'var(--ink-soft)',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: '1.4rem',
              color: enabled ? 'var(--accent)' : 'var(--ink)',
            }}
          >
            Dummy players are currently{' '}
            <strong>{enabled ? 'ON' : 'OFF'}</strong>
          </div>
          <div
            style={{
              fontSize: '0.8rem',
              marginTop: '0.35rem',
              color: enabled ? 'var(--gray-light)' : 'var(--gray)',
            }}
          >
            {enabled
              ? 'Simulated players are visible on the public leaderboard alongside real players.'
              : 'Only real players appear on the public leaderboard.'}
          </div>
        </div>
        <form action={toggleFlagAction}>
          <input type="hidden" name="key" value="simulated_data" />
          <input type="hidden" name="enabled" value={String(!enabled)} />
          <button
            type="submit"
            className={enabled ? 'action action--ghost' : 'action'}
            style={enabled ? { borderColor: 'var(--paper)', color: 'var(--paper)' } : {}}
          >
            Turn {enabled ? 'OFF — real players only' : 'ON — add dummy players'}
          </button>
        </form>
      </div>

      {/* ----------------------------------------------------------- Stats */}
      <div className="stat-grid" style={{ marginBottom: '2rem' }}>
        <div>
          <div className="stat__value">{totalDummies.toLocaleString()}</div>
          <span className="stat__label">Total dummy player entries</span>
        </div>
        <div>
          <div className="stat__value">{publishedGames.length}</div>
          <span className="stat__label">Published games</span>
        </div>
        <div>
          <div className="stat__value">
            {publishedGames.length > 0
              ? Math.round(totalDummies / Math.max(1, publishedGames.length))
              : 0}
          </div>
          <span className="stat__label">Avg dummies per game</span>
        </div>
      </div>

      {/* ------------------------------------------------ Generate for all */}
      <div style={{ padding: '1.2rem', background: 'var(--paper-deep)', marginBottom: '1rem' }}>
        <h2 className="admin-title" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
          Generate dummy players for all games
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: '1rem' }}>
          Tops up every published game to the specified number of dummy players. Games that already
          have enough entries are skipped.
        </p>
        <form action={generateAllSimulatedAction} className="inline-form">
          <label className="field" style={{ maxWidth: '10rem' }}>
            <span className="field__label">Per game</span>
            <select name="count" defaultValue="300">
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="300">300</option>
              <option value="500">500</option>
              <option value="1000">1,000</option>
            </select>
          </label>
          <button
            type="submit"
            className="action"
            style={{ alignSelf: 'flex-end', marginBottom: '1rem' }}
          >
            Generate for all {publishedGames.length} games
          </button>
        </form>
      </div>

      {/* ------------------------------------------------ Remove all */}
      <div style={{ marginBottom: '2rem' }}>
        <form action={deleteSimulatedAction} className="inline-form">
          <input type="hidden" name="gameId" value="" />
          <button type="submit" className="action action--ghost">
            Remove all dummy players ({totalDummies.toLocaleString()} entries)
          </button>
        </form>
        <p className="label" style={{ marginTop: '0.5rem' }}>
          Removes all simulated entries across every game. Does not affect real players.
        </p>
      </div>

      {/* -------------------------------------------- Per-game breakdown */}
      {gamesWithDummies.length > 0 ? (
        <>
          <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
            Games with real rounds
          </h2>
          <p className="label" style={{ marginBottom: '0.75rem' }}>
            Use the Comparisons page to generate per-game amounts.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Game</th>
                <th scope="col">Date</th>
                <th scope="col">Status</th>
                <th scope="col">Approved rounds</th>
              </tr>
            </thead>
            <tbody>
              {gamesWithDummies.map((game) => (
                <tr key={game.id}>
                  <td>#{game.game_number}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
                    {game.active_date}
                  </td>
                  <td>
                    <span className="pill" data-tone={game.derived === 'live' ? 'live' : 'published'}>
                      {game.derived}
                    </span>
                  </td>
                  <td>
                    {game.approved_rounds}/{game.round_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
