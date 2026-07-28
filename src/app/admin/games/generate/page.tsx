import { CopyBox } from '@/components/CopyBox';
import { serviceClient } from '@/lib/supabase/admin';
import { getNextGameNumber, getRunway } from '@/lib/games';
import { IMPORT_SCHEMA_DOC } from '@/lib/import-schema';
import { formatGameDate } from '@/lib/time';
import { generatePromptAction, importBankAction, type ImportReport } from '../../actions';

export const dynamic = 'force-dynamic';

type BatchRow = {
  id: string;
  start_date: string | null;
  days_requested: number | null;
  prompt: string | null;
  status: string;
  report: ImportReport | null;
  created_at: string;
};

async function getBatch(id?: string): Promise<BatchRow | null> {
  const db = serviceClient();
  const query = db
    .from('game_generation_batches')
    .select('id, start_date, days_requested, prompt, status, report, created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  const { data } = id ? await query.eq('id', id) : await query;
  const rows = (data ?? []) as unknown as BatchRow[];
  return rows[0] ?? null;
}

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: { batch?: string; status?: string };
}) {
  const [runway, nextNumber, batch] = await Promise.all([
    getRunway(),
    getNextGameNumber(),
    getBatch(searchParams.batch),
  ]);

  const report = batch?.report ?? null;

  return (
    <div>
      <h1 className="admin-title">Create games</h1>
      <p className="label">
        Runway {runway.runwayDays} days · next unused date {formatGameDate(runway.nextUnusedDate)} ·
        next game number #{String(nextNumber).padStart(3, '0')}
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
          1 · Generate the prompt
        </h2>
        <p className="label">
          The prompt is built from the database: every previously published fake, recently used real
          words, recently used decoys, the difficulty curve and the exact import schema.
        </p>
        <form action={generatePromptAction} className="inline-form">
          <label className="field" style={{ maxWidth: '8rem' }}>
            <span className="field__label">Days</span>
            <input type="number" name="days" min={1} max={60} defaultValue={20} />
          </label>
          <label className="field" style={{ maxWidth: '12rem' }}>
            <span className="field__label">Start date</span>
            <input type="text" name="startDate" defaultValue={runway.nextUnusedDate} />
          </label>
          <button type="submit" className="action">
            Generate prompt
          </button>
        </form>
      </section>

      {batch?.prompt ? (
        <section style={{ marginTop: '2rem' }}>
          <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
            2 · Copy it into an AI
          </h2>
          <p className="label">
            Batch {batch.id.slice(0, 8)} · {batch.days_requested} days from {batch.start_date} ·{' '}
            {batch.status}
          </p>
          <CopyBox text={batch.prompt} />
        </section>
      ) : null}

      <section style={{ marginTop: '2rem' }}>
        <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
          3 · Import the JSON
        </h2>
        <p className="label">
          Everything imported lands as <strong>needs_review</strong>. Nothing is ever published
          automatically.
        </p>
        <form action={importBankAction}>
          <input type="hidden" name="batchId" value={batch?.id ?? ''} />
          <label className="field">
            <span className="field__label">Generated bank JSON</span>
            <textarea name="json" rows={12} placeholder='{"games":[ ... ]}' />
          </label>
          <label className="checklist" style={{ marginBottom: '1rem' }}>
            <span style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <input type="checkbox" name="overwrite" />
              Replace existing games on the same dates
            </span>
          </label>
          <button type="submit" className="action">
            Import as draft
          </button>
        </form>
      </section>

      {report ? (
        <section style={{ marginTop: '2rem' }}>
          <h2 className="admin-title" style={{ fontSize: '1.1rem' }}>
            Import preview
          </h2>
          <p className="issue" data-level={report.ok ? 'warning' : 'error'}>
            {report.message}
          </p>

          {report.summary ? (
            <div className="admin-grid">
              <div>
                <div className="stat__value">{report.summary.games}</div>
                <span className="stat__label">Games</span>
              </div>
              <div>
                <div className="stat__value">{report.summary.rounds}</div>
                <span className="stat__label">Rounds</span>
              </div>
              <div>
                <div className="stat__value">{report.summary.options}</div>
                <span className="stat__label">Displayed options</span>
              </div>
              <div>
                <div className="stat__value">{report.summary.uniqueRealWords}</div>
                <span className="stat__label">Real words</span>
              </div>
              <div>
                <div className="stat__value">{report.summary.fakes}</div>
                <span className="stat__label">Fakes created</span>
              </div>
            </div>
          ) : null}

          {report.parseIssues?.length ? (
            <div>
              <h3 className="label">Schema problems</h3>
              {report.parseIssues.map((issue, index) => (
                <p className="issue" data-level="error" key={index}>
                  {issue}
                </p>
              ))}
            </div>
          ) : null}

          {report.games?.map((entry) => (
            <div key={`${entry.date}-${entry.gameNumber}`} style={{ marginTop: '1rem' }}>
              <p className="label">
                {entry.date} · #{String(entry.gameNumber).padStart(3, '0')} ·{' '}
                {entry.errors.length} errors · {entry.warnings.length} warnings
              </p>
              {entry.errors.map((message, index) => (
                <p className="issue" data-level="error" key={`e${index}`}>
                  {message}
                </p>
              ))}
              {entry.warnings.map((message, index) => (
                <p className="issue" data-level="warning" key={`w${index}`}>
                  {message}
                </p>
              ))}
            </div>
          ))}
        </section>
      ) : null}

      <details className="expand" style={{ marginTop: '2.5rem' }}>
        <summary>Import schema reference</summary>
        <pre
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '0.75rem',
            whiteSpace: 'pre-wrap',
            color: 'var(--ink-soft)',
          }}
        >
          {IMPORT_SCHEMA_DOC}
        </pre>
      </details>
    </div>
  );
}
