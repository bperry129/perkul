import Link from 'next/link';
import {
  getDashboardSummary,
  resolveRange,
  percentChange,
  type DateRange,
} from '@/lib/admin-analytics';
import { getRunway } from '@/lib/games';
import { formatElapsed, formatGameDate } from '@/lib/time';
import { padGameNumber } from '@/lib/brand';

export const dynamic = 'force-dynamic';

/**
 * How a metric's movement should be read.
 *  - `ratio`   percentage change, for counts (attempts, registrations)
 *  - `points`  absolute difference, for a score out of ten
 *  - `pp`      percentage points, for a rate — a completion rate going 40% → 44%
 *              is "+4pp", not "+10%", and conflating the two is how dashboards
 *              start lying to people.
 */
type DeltaMode = 'ratio' | 'points' | 'pp';

function DeltaBadge({
  current,
  prior,
  mode,
  /** False for metrics where smaller is better, i.e. median time. */
  higherIsBetter = true,
  priorLabel,
}: {
  current: number | null;
  prior: number | null;
  mode: DeltaMode;
  higherIsBetter?: boolean;
  priorLabel: string;
}) {
  // Nothing to compare against: say so rather than implying a flat line.
  if (current == null || prior == null) {
    return <span className="metric-delta" data-dir="flat">— {priorLabel}</span>;
  }

  const raw = mode === 'ratio' ? percentChange(current, prior) : current - prior;

  if (raw == null) {
    return (
      <span className="metric-delta" data-dir="flat">
        {prior === 0 && current > 0 ? 'new' : '—'} {priorLabel}
      </span>
    );
  }

  const rounded = Math.round(raw * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  const text =
    mode === 'ratio'
      ? `${sign}${rounded.toFixed(0)}%`
      : mode === 'pp'
        ? `${sign}${rounded.toFixed(1)}pp`
        : `${sign}${rounded.toFixed(2)}`;

  // Direction is about good/bad, not up/down, so the colour stays meaningful
  // for median time where a fall is a win.
  const improving = higherIsBetter ? rounded > 0 : rounded < 0;
  const dir = rounded === 0 ? 'flat' : improving ? 'up' : 'down';
  const arrow = rounded === 0 ? '' : rounded > 0 ? '▲ ' : '▼ ';

  return (
    <span className="metric-delta" data-dir={dir}>
      {arrow}
      {text} {priorLabel}
    </span>
  );
}

function Metric({
  value,
  label,
  delta,
}: {
  value: string;
  label: string;
  delta?: React.ReactNode;
}) {
  return (
    <div>
      <div className="stat__value">{value}</div>
      <span className="stat__label">{label}</span>
      {delta ? <div style={{ marginTop: '0.3rem' }}>{delta}</div> : null}
    </div>
  );
}

/** Preset pills. `custom` never matches, so hand-picked dates highlight nothing. */
function RangeTabs({ range }: { range: DateRange }) {
  const presets = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'last7', label: 'Past 7 days' },
    { key: 'last30', label: 'Past 30 days' },
  ] as const;

  return (
    <div className="tabs">
      {presets.map((preset) => (
        <Link
          key={preset.key}
          className="tabs__link"
          href={preset.key === 'today' ? '/admin' : `/admin?range=${preset.key}`}
          aria-current={range.preset === preset.key ? 'page' : undefined}
        >
          {preset.label}
        </Link>
      ))}
    </div>
  );
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams?: { range?: string; from?: string; to?: string };
}) {
  // Resolved before the query so the picker and the numbers can never disagree.
  const range = resolveRange(searchParams ?? {});
  const [summary, runway] = await Promise.all([getDashboardSummary(range), getRunway()]);
  const { current, prior, previous } = summary;
  const priorLabel = previous.label;

  return (
    <div>
      <h1 className="admin-title">{range.label}</h1>
      <p className="label">
        {range.days === 1
          ? formatGameDate(range.start)
          : `${formatGameDate(range.start)} — ${formatGameDate(range.end)} · ${range.days} days`}{' '}
        · America/New_York · real players only
      </p>

      <RangeTabs range={range} />

      {/* GET form: the range lives entirely in the URL, so any view is linkable
          and refreshable, and no client state is involved. */}
      <form className="inline-form" method="get" action="/admin" style={{ margin: '0.6rem 0 0' }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field__label">From</span>
          <input type="date" name="from" defaultValue={range.start} max={summary.today} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field__label">To</span>
          <input type="date" name="to" defaultValue={range.end} max={summary.today} />
        </label>
        <button className="action action--ghost action--small" type="submit">
          Apply
        </button>
      </form>

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
        <Metric
          value={String(current.starts)}
          label="Attempts started"
          delta={
            <DeltaBadge current={current.starts} prior={prior.starts} mode="ratio" priorLabel={priorLabel} />
          }
        />
        <Metric
          value={String(current.completions)}
          label="Ranked completions"
          delta={
            <DeltaBadge
              current={current.completions}
              prior={prior.completions}
              mode="ratio"
              priorLabel={priorLabel}
            />
          }
        />
        <Metric
          value={current.completionRate != null ? `${current.completionRate.toFixed(0)}%` : '—'}
          label="Completion rate"
          delta={
            <DeltaBadge
              current={current.completionRate}
              prior={prior.completionRate}
              mode="pp"
              priorLabel={priorLabel}
            />
          }
        />
        <Metric
          value={current.avgCorrect != null ? current.avgCorrect.toFixed(2) : '—'}
          label="Average accuracy /10"
          delta={
            <DeltaBadge
              current={current.avgCorrect}
              prior={prior.avgCorrect}
              mode="points"
              priorLabel={priorLabel}
            />
          }
        />
        <Metric
          value={current.medianElapsedMs != null ? formatElapsed(current.medianElapsedMs) : '—'}
          label="Median time"
          delta={
            <DeltaBadge
              current={current.medianElapsedMs}
              prior={prior.medianElapsedMs}
              mode="ratio"
              higherIsBetter={false}
              priorLabel={priorLabel}
            />
          }
        />
        <Metric
          value={String(current.newRegistrations)}
          label="New registrations"
          delta={
            <DeltaBadge
              current={current.newRegistrations}
              prior={prior.newRegistrations}
              mode="ratio"
              priorLabel={priorLabel}
            />
          }
        />
        <Metric
          value={String(current.guestAttempts)}
          label="Guest attempts"
          delta={
            <DeltaBadge
              current={current.guestAttempts}
              prior={prior.guestAttempts}
              mode="ratio"
              priorLabel={priorLabel}
            />
          }
        />
        <Metric
          value={String(current.accountAttempts)}
          label="Attempts by account holders"
          delta={
            <DeltaBadge
              current={current.accountAttempts}
              prior={prior.accountAttempts}
              mode="ratio"
              priorLabel={priorLabel}
            />
          }
        />
      </div>

      <hr />

      {/* Lifetime figures: no date range applies, so they carry no comparison. */}
      <div className="admin-grid">
        <Metric value={String(summary.registeredPlayersTotal)} label="Registered players (all time)" />
        <Metric value={String(summary.simulatedAttempts)} label="Simulated rows (excluded above)" />
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
