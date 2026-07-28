import Link from 'next/link';
import { getDashboardSummary } from '@/lib/admin-analytics';
import { getRunway } from '@/lib/games';
import { formatElapsed, formatGameDate } from '@/lib/time';
import { padGameNumber } from '@/lib/brand';

export const dynamic = 'force-dynamic';

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="stat__value">{value}</div>
      <span className="stat__label">{label}</span>
    </div>
  );
}

export default async function AdminDashboard() {
  const [summary, runway] = await Promise.all([getDashboardSummary(), getRunway()]);

  return (
    <div>
      <h1 className="admin-title">Today</h1>
      <p className="label">
        {formatGameDate(summary.today)} · America/New_York calendar date decides the live game.
      </p>

      {runway.warning ? (
        <div className="notice">
          <strong>{runway.runwayDays} days of games remaining.</strong> Fewer than seven future days
          are published. <Link href="/admin/games/generate">Generate the next bank</Link>.
        </div>
      ) : null}

      <div className="admin-grid">
        <Metric
          value={summary.todayGame ? `#${padGameNumber(summary.todayGame.gameNumber)}` : '—'}
          label={`Today · ${summary.todayGame?.status ?? 'not published'}`}
        />
        <Metric
          value={summary.tomorrowGame ? `#${padGameNumber(summary.tomorrowGame.gameNumber)}` : '—'}
          label={`Tomorrow · ${summary.tomorrowGame?.status ?? 'missing'}`}
        />
        <Metric value={String(summary.publishedFuture)} label="Published days ahead" />
        <Metric value={String(runway.runwayDays)} label="Runway (days)" />
      </div>

      <hr />

      <div className="admin-grid">
        <Metric value={String(summary.startsToday)} label="Attempts started today" />
        <Metric value={String(summary.completionsToday)} label="Ranked completions" />
        <Metric
          value={summary.completionRate != null ? `${summary.completionRate.toFixed(0)}%` : '—'}
          label="Completion rate"
        />
        <Metric
          value={summary.avgCorrect != null ? summary.avgCorrect.toFixed(2) : '—'}
          label="Average accuracy /10"
        />
        <Metric
          value={summary.medianElapsedMs != null ? formatElapsed(summary.medianElapsedMs) : '—'}
          label="Median time"
        />
        <Metric value={String(summary.registeredPlayers)} label="Registered players" />
        <Metric value={String(summary.anonymousPlayersToday)} label="Guests today" />
        <Metric value={String(summary.simulatedAttempts)} label="Simulated rows" />
      </div>

      <hr />

      <h2 className="admin-title" style={{ fontSize: '1.2rem' }}>
        Game bank
      </h2>
      <p className="label">
        {runway.scheduledFuture} scheduled · last scheduled game{' '}
        {runway.lastScheduledDate ? formatGameDate(runway.lastScheduledDate) : '—'} · next unused date{' '}
        {formatGameDate(runway.nextUnusedDate)}
      </p>

      <div className="toolbar">
        <Link className="action action--ghost" href="/admin/games">
          Open game bank
        </Link>
        <Link className="action" href="/admin/games/generate">
          Generate next bank prompt
        </Link>
      </div>
    </div>
  );
}
