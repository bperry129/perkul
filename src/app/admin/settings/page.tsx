import { serviceClient } from '@/lib/supabase/admin';
import { BRAND } from '@/lib/brand';
import { nyDateString, formatGameDate } from '@/lib/time';
import { getRunway } from '@/lib/games';

export const dynamic = 'force-dynamic';

type AuditRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default async function SettingsPage() {
  const db = serviceClient();
  const [{ data: auditData }, runway] = await Promise.all([
    db
      .from('admin_audit_log')
      .select('id, action, entity_type, entity_id, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(40),
    getRunway(),
  ]);

  const audit = (auditData ?? []) as unknown as AuditRow[];

  return (
    <div>
      <h1 className="admin-title">Settings</h1>

      <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
        Scheduling
      </h2>
      <table className="table">
        <tbody>
          <tr>
            <td style={{ width: '16rem' }}>Timezone</td>
            <td>
              <code>{BRAND.timezone}</code> — the New York calendar date selects the live game. No
              cron job is required; EST/EDT is resolved from the IANA database.
            </td>
          </tr>
          <tr>
            <td>First game date</td>
            <td>{formatGameDate(BRAND.firstGameDate)} (game #001)</td>
          </tr>
          <tr>
            <td>Today (New York)</td>
            <td>{nyDateString()}</td>
          </tr>
          <tr>
            <td>Rounds per game</td>
            <td>{BRAND.roundsPerGame} rounds × {BRAND.optionsPerRound} words</td>
          </tr>
          <tr>
            <td>Runway</td>
            <td>
              {runway.runwayDays} days · last scheduled{' '}
              {runway.lastScheduledDate ? formatGameDate(runway.lastScheduledDate) : '—'}
            </td>
          </tr>
        </tbody>
      </table>

      <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
        Brand
      </h2>
      <p className="label">
        The product name is a single configurable constant (<code>src/lib/brand.ts</code>, override
        with <code>NEXT_PUBLIC_BRAND_NAME</code>). Renaming does not require a refactor.
      </p>

      <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
        Operations
      </h2>
      <table className="table">
        <tbody>
          <tr>
            <td style={{ width: '16rem' }}>Grant admin</td>
            <td>
              <code>npm run admin:create -- you@example.com</code>
            </td>
          </tr>
          <tr>
            <td>Seed the initial bank</td>
            <td>
              <code>npm run seed</code> (add <code>--reset</code> to replace existing games)
            </td>
          </tr>
          <tr>
            <td>Validate seed content offline</td>
            <td>
              <code>npm run content:check</code>
            </td>
          </tr>
          <tr>
            <td>Run the rule tests</td>
            <td>
              <code>npm test</code>
            </td>
          </tr>
        </tbody>
      </table>

      <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
        Audit log
      </h2>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Action</th>
            <th scope="col">Entity</th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {audit.map((row) => (
            <tr key={row.id}>
              <td style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>
                {row.created_at.replace('T', ' ').slice(0, 19)}
              </td>
              <td>{row.action}</td>
              <td>
                {row.entity_type}
                {row.entity_id ? ` · ${row.entity_id.slice(0, 8)}` : ''}
              </td>
              <td style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem' }}>
                {JSON.stringify(row.metadata).slice(0, 120)}
              </td>
            </tr>
          ))}
          {audit.length === 0 ? (
            <tr>
              <td colSpan={4}>Nothing logged yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
