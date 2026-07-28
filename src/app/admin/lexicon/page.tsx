import { listLexicon } from '@/lib/lexicon';
import { updateLexiconAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function LexiconPage({
  searchParams,
}: {
  searchParams: { q?: string; accepted?: string; page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page ?? '1') || 1);
  const pageSize = 60;
  const accepted =
    searchParams.accepted === 'yes' ? true : searchParams.accepted === 'no' ? false : null;

  const { rows, count } = await listLexicon({
    search: searchParams.q,
    accepted,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const lastPage = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div>
      <h1 className="admin-title">Curated lexicon</h1>
      <p className="label">
        {count.toLocaleString()} entries · this is the only authority for “is that a word”. Fakes
        never appear here.
      </p>

      <form className="inline-form" method="get">
        <label className="field" style={{ maxWidth: '16rem' }}>
          <span className="field__label">Search</span>
          <input type="text" name="q" defaultValue={searchParams.q ?? ''} placeholder="brume" />
        </label>
        <label className="field" style={{ maxWidth: '12rem' }}>
          <span className="field__label">Accepted</span>
          <select name="accepted" defaultValue={searchParams.accepted ?? ''}>
            <option value="">All</option>
            <option value="yes">Accepted only</option>
            <option value="no">Rejected only</option>
          </select>
        </label>
        <button className="action action--ghost" type="submit">
          Filter
        </button>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th scope="col">Word</th>
            <th scope="col">POS</th>
            <th scope="col">Short definition</th>
            <th scope="col">Expanded</th>
            <th scope="col">Diff.</th>
            <th scope="col">Accepted</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.id}>
              <td style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem' }}>{entry.word}</td>
              <td>
                <form action={updateLexiconAction} id={`lex-${entry.id}`}>
                  <input type="hidden" name="id" value={entry.id} />
                  <input
                    type="text"
                    name="partOfSpeech"
                    defaultValue={entry.part_of_speech ?? ''}
                    style={{ width: '5rem', padding: '0.3rem' }}
                  />
                </form>
              </td>
              <td>
                <input
                  form={`lex-${entry.id}`}
                  type="text"
                  name="shortDefinition"
                  defaultValue={entry.short_definition ?? ''}
                  style={{ width: '100%', padding: '0.3rem' }}
                />
              </td>
              <td>
                <input
                  form={`lex-${entry.id}`}
                  type="text"
                  name="expandedDefinition"
                  defaultValue={entry.expanded_definition ?? ''}
                  style={{ width: '100%', padding: '0.3rem' }}
                />
              </td>
              <td>
                <input
                  form={`lex-${entry.id}`}
                  type="number"
                  name="difficulty"
                  min={1}
                  max={5}
                  defaultValue={entry.difficulty}
                  style={{ width: '3.5rem', padding: '0.3rem' }}
                />
              </td>
              <td>
                <input
                  form={`lex-${entry.id}`}
                  type="checkbox"
                  name="accepted"
                  defaultChecked={entry.accepted_for_game}
                />
              </td>
              <td>
                <button form={`lex-${entry.id}`} type="submit" className="action--quiet">
                  Save
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7}>No entries. Seed the initial bank to populate the lexicon.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {lastPage > 1 ? (
        <p className="label">
          Page {page} of {lastPage} ·{' '}
          {page > 1 ? <a href={`/admin/lexicon?page=${page - 1}`}>previous</a> : null}{' '}
          {page < lastPage ? <a href={`/admin/lexicon?page=${page + 1}`}>next</a> : null}
        </p>
      ) : null}
    </div>
  );
}
