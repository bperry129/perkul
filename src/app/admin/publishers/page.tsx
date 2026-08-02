import { listPublishers, listPublisherPages } from '@/lib/publisher-admin';
import { BRAND, siteUrl } from '@/lib/brand';
import {
  createPublisherAction,
  runAttributionCheckAction,
  updatePublisherAction,
} from '../actions';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function PublishersPage() {
  const publishers = await listPublishers();
  const pagesByPublisher = new Map(
    await Promise.all(
      publishers.map(async (p) => [p.id, await listPublisherPages(p.id)] as const),
    ),
  );

  return (
    <div>
      <h1 className="admin-title">Publishers</h1>
      <p className="label">
        Every publisher gets a <code>key</code> that goes in their copy-paste snippet and an{' '}
        <code>allowed_origins</code> list that is the actual security boundary — the key alone
        proves nothing, since it lives in public HTML the moment a page ships. See{' '}
        <code>src/lib/publishers.ts</code> for how a request is authorised.
      </p>

      <details style={{ marginBottom: '1.5rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>+ New publisher</summary>
        <form action={createPublisherAction} className="inline-form" style={{ marginTop: '0.75rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.6rem' }}>
          <label className="field" style={{ width: '100%', maxWidth: '28rem' }}>
            <span className="field__label">Name</span>
            <input type="text" name="name" required placeholder="e.g. Daily Gazette" />
          </label>
          <label className="field" style={{ width: '100%', maxWidth: '28rem' }}>
            <span className="field__label">Contact email</span>
            <input type="email" name="contactEmail" placeholder="editor@example.com" />
          </label>
          <label className="field" style={{ width: '100%', maxWidth: '28rem' }}>
            <span className="field__label">Allowed origins (one per line — https://example.com)</span>
            <textarea name="allowedOrigins" rows={3} style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: '0.8rem' }} />
          </label>
          <button type="submit" className="action">
            Create publisher
          </button>
        </form>
      </details>

      {publishers.length === 0 ? (
        <p className="label">No publishers yet.</p>
      ) : null}

      {publishers.map((p) => {
        const pages = pagesByPublisher.get(p.id) ?? [];
        const embedUrl = `${siteUrl('/embed/daily')}?k=${p.key}`;
        return (
          <div key={p.id} className="admin-card" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--rule)', borderRadius: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'baseline' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{p.name}</h2>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <span className="pill" data-tone={p.active ? 'live' : 'draft'}>
                  {p.active ? 'active' : 'suspended'}
                </span>
                <span className="pill" data-tone={p.attribution_ok ? 'live' : 'blocked'}>
                  attribution {p.attribution_ok ? 'ok' : 'missing'}
                </span>
                {p.ads_enabled ? <span className="pill">ads on</span> : null}
              </div>
            </div>

            <p style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem', margin: '0.5rem 0' }}>
              key: <strong>{p.key}</strong> · {p.pageCount} known page{p.pageCount === 1 ? '' : 's'} ·{' '}
              {p.attemptCount} play{p.attemptCount === 1 ? '' : 's'}
            </p>

            <p style={{ fontSize: '0.82rem', margin: '0.4rem 0' }}>
              Embed URL: <a href={embedUrl} target="_blank" rel="noopener noreferrer">{embedUrl}</a>
            </p>
            <p style={{ fontSize: '0.82rem', margin: '0.4rem 0' }}>
              Snippet:{' '}
              <code style={{ fontSize: '0.75rem' }}>
                {`<div class="perkul-widget" data-perkul-key="${p.key}"></div><script src="${siteUrl('/embed.js')}" async></script>`}
              </code>
            </p>

            {p.attribution_grace_until ? (
              <p className="notice notice--quiet" style={{ fontSize: '0.8rem' }}>
                Attribution missing since the crawler last checked. Grace period until{' '}
                {formatDate(p.attribution_grace_until)} before the embed pauses.
              </p>
            ) : null}

            <details>
              <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Edit</summary>
              <form
                action={updatePublisherAction}
                className="inline-form"
                style={{ marginTop: '0.6rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.6rem' }}
              >
                <input type="hidden" name="id" value={p.id} />
                <label className="field" style={{ width: '100%', maxWidth: '28rem' }}>
                  <span className="field__label">Name</span>
                  <input type="text" name="name" defaultValue={p.name} required />
                </label>
                <label className="field" style={{ width: '100%', maxWidth: '28rem' }}>
                  <span className="field__label">Contact email</span>
                  <input type="email" name="contactEmail" defaultValue={p.contact_email ?? ''} />
                </label>
                <label className="field" style={{ width: '100%', maxWidth: '28rem' }}>
                  <span className="field__label">Allowed origins (one per line)</span>
                  <textarea
                    name="allowedOrigins"
                    rows={3}
                    defaultValue={p.allowed_origins.join('\n')}
                    style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: '0.8rem' }}
                  />
                </label>
                <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem' }}>
                  <input type="checkbox" name="active" defaultChecked={p.active} /> Active (unchecking
                  immediately fails <code>frame-ancestors</code> for this key)
                </label>
                <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem' }}>
                  <input type="checkbox" name="adsEnabled" defaultChecked={p.ads_enabled} /> Ads enabled
                  (only for a publisher on a revenue split)
                </label>
                <label className="field" style={{ width: '100%', maxWidth: '28rem' }}>
                  <span className="field__label">Notes</span>
                  <textarea name="notes" rows={2} defaultValue={p.notes ?? ''} style={{ width: '100%' }} />
                </label>
                <button type="submit" className="action--quiet">
                  Save
                </button>
              </form>
            </details>

            <details style={{ marginTop: '0.6rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                Known pages &amp; attribution ({pages.length})
              </summary>
              {pages.length === 0 ? (
                <p className="label">
                  No pages reported yet — nothing to crawl until the embed has loaded at least once
                  on a page whose origin is on the allowlist above.
                </p>
              ) : (
                <table className="table" style={{ marginTop: '0.5rem' }}>
                  <thead>
                    <tr>
                      <th scope="col">URL</th>
                      <th scope="col">Last seen</th>
                      <th scope="col">Last checked</th>
                      <th scope="col">Attribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((page) => (
                      <tr key={page.id}>
                        <td style={{ maxWidth: '22rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <a href={page.url} target="_blank" rel="noopener noreferrer">
                            {page.url}
                          </a>
                        </td>
                        <td style={{ fontSize: '0.78rem' }}>{formatDate(page.last_seen_at)}</td>
                        <td style={{ fontSize: '0.78rem' }}>{formatDate(page.last_checked_at)}</td>
                        <td>
                          {page.attribution_found === null ? (
                            <span className="pill">not checked</span>
                          ) : (
                            <span className="pill" data-tone={page.attribution_found ? 'live' : 'blocked'}>
                              {page.attribution_found ? 'found' : 'missing'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <form action={runAttributionCheckAction} style={{ marginTop: '0.6rem' }}>
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="action--quiet">
                  Run attribution check now
                </button>
              </form>
            </details>
          </div>
        );
      })}

      <p className="label" style={{ marginTop: '1rem' }}>
        {BRAND.name} widget docs: <code>docs/widget-handoff.md</code>. The attribution crawler
        (<code>src/lib/attribution.ts</code>) is fetch-based and server-side — it never trusts the
        embed's own report of whether the credit link is present.
      </p>
    </div>
  );
}
