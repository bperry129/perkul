import { searchPlayers } from '@/lib/admin-analytics';
import { updatePlayerAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PlayersPage({ searchParams }: { searchParams: { q?: string } }) {
  const players = await searchPlayers(searchParams.q);

  return (
    <div>
      <h1 className="admin-title">Players</h1>
      <p className="label">
        Display names only. Emails are never surfaced here — sign-in identity lives in Supabase Auth.
      </p>

      <form className="inline-form" method="get">
        <label className="field" style={{ maxWidth: '18rem' }}>
          <span className="field__label">Search display name</span>
          <input type="text" name="q" defaultValue={searchParams.q ?? ''} />
        </label>
        <button className="action action--ghost" type="submit">
          Search
        </button>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th scope="col">Display name</th>
            <th scope="col">Attempts</th>
            <th scope="col">Joined</th>
            <th scope="col">Admin</th>
            <th scope="col">Leaderboard</th>
            <th scope="col">Name banned</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.userId}>
              <td>
                <form action={updatePlayerAction} id={`p-${player.userId}`}>
                  <input type="hidden" name="userId" value={player.userId} />
                  <input
                    type="text"
                    name="displayName"
                    defaultValue={player.displayName ?? ''}
                    style={{ width: '11rem', padding: '0.3rem' }}
                  />
                </form>
              </td>
              <td>{player.attempts}</td>
              <td style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>
                {player.createdAt.slice(0, 10)}
              </td>
              <td>{player.isAdmin ? <span className="pill">admin</span> : '—'}</td>
              <td>
                <input
                  form={`p-${player.userId}`}
                  type="checkbox"
                  name="leaderboardOptIn"
                  defaultChecked={player.leaderboardOptIn}
                />
              </td>
              <td>
                <input
                  form={`p-${player.userId}`}
                  type="checkbox"
                  name="bannedName"
                  defaultChecked={player.isBannedName}
                />
              </td>
              <td>
                <button form={`p-${player.userId}`} type="submit" className="action--quiet">
                  Save
                </button>
              </td>
            </tr>
          ))}
          {players.length === 0 ? (
            <tr>
              <td colSpan={7}>No registered players yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <p className="label">
        Admin rights are granted deliberately with <code>npm run admin:create -- email@example.com</code>{' '}
        — not from this screen. Deleting player data is intentionally not a one-click action.
      </p>
    </div>
  );
}
