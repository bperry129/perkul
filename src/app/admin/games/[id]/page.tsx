import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGameWithRounds, derivedStatus } from '@/lib/games';
import { gameRecordToDraft } from '@/lib/persist';
import { getHistoryContext, historyWithout } from '@/lib/lexicon';
import { validateGame } from '@/lib/validation';
import { ROUND_TYPES } from '@/lib/types';
import { formatGameDate } from '@/lib/time';
import { padGameNumber } from '@/lib/brand';
import {
  approveRoundAction,
  deleteGameAction,
  moveRoundAction,
  saveRoundAction,
  setGameStatusAction,
} from '../../actions';

export const dynamic = 'force-dynamic';

const CHECKLIST: Array<[string, string]> = [
  ['q_fake', 'Fake plausible?'],
  ['q_decoy', 'Decoy legitimately tricky?'],
  ['q_anchors', 'Three reasonable anchors?'],
  ['q_archaic', 'No archaic nonsense?'],
  ['q_jargon', 'No accidental technical term?'],
  ['q_definitions', 'Definitions good?'],
  ['q_explanation', 'Explanation interesting?'],
  ['q_distinct', 'Different from recent rounds?'],
  ['q_fair', 'Fair?'],
];

export default async function GameEditorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { blocked?: string };
}) {
  const game = await getGameWithRounds(params.id);
  if (!game) notFound();

  const draft = gameRecordToDraft(game);
  const history = historyWithout(await getHistoryContext(), [draft]);
  const report = validateGame(draft, history);
  const status = derivedStatus(game);
  const rounds = game.rounds ?? [];

  return (
    <div>
      <div className="dateline">
        <Link href="/admin/games">← Game bank</Link>
        <span>
          {formatGameDate(game.active_date)} · {game.active_date}
        </span>
      </div>

      <h1 className="admin-title">
        Game #{padGameNumber(game.game_number)}{' '}
        <span className="pill" data-tone={status}>
          {status}
        </span>
      </h1>

      {searchParams.blocked ? (
        <div className="notice">
          Publication was blocked: this game still has hard validation failures.
        </div>
      ) : null}

      {/* ------------------------------------------------ validation report */}
      <section style={{ margin: '1.5rem 0' }}>
        <h2 className="admin-title" style={{ fontSize: '1.05rem' }}>
          Validator
        </h2>
        {report.ok ? (
          <p className="issue">No hard failures. {report.warnings.length} warning(s).</p>
        ) : null}
        {report.errors.map((issue, index) => (
          <p className="issue" data-level="error" key={`e${index}`}>
            {issue.message}
          </p>
        ))}
        {report.warnings.map((issue, index) => (
          <p className="issue" data-level="warning" key={`w${index}`}>
            {issue.message}
          </p>
        ))}
      </section>

      {/* ---------------------------------------------------- status actions */}
      <div className="toolbar">
        {(['draft', 'needs_review', 'ready', 'published'] as const).map((next) => (
          <form action={setGameStatusAction} key={next}>
            <input type="hidden" name="gameId" value={game.id} />
            <input type="hidden" name="status" value={next} />
            <button
              type="submit"
              className={next === 'published' ? 'action' : 'action action--ghost'}
              disabled={game.status === next}
            >
              {next === 'published' ? 'Publish' : `Mark ${next.replace('_', ' ')}`}
            </button>
          </form>
        ))}
        {game.status !== 'published' ? (
          <form action={deleteGameAction}>
            <input type="hidden" name="gameId" value={game.id} />
            <button type="submit" className="action--quiet">
              Delete game
            </button>
          </form>
        ) : null}
      </div>
      <p className="label">
        Ready and Published both require a clean validator. Imported banks always begin as
        needs_review.
      </p>

      {/* ------------------------------------------------------ player preview */}
      <details className="expand" style={{ margin: '1.5rem 0' }}>
        <summary>Preview the player experience</summary>
        {rounds.map((round) => (
          <div key={round.id} style={{ margin: '1rem 0' }}>
            <p className="label">Round {String(round.position).padStart(2, '0')}</p>
            <p style={{ fontFamily: 'var(--serif)', fontSize: '1.2rem' }}>
              {(round.options ?? []).map((o) => o.display_word).join(' · ')}
            </p>
          </div>
        ))}
      </details>

      {/* ---------------------------------------------------------- the rounds */}
      {rounds.map((round) => {
        const options = round.options ?? [];
        const roundIssues = [...report.errors, ...report.warnings].filter(
          (issue) => issue.round === round.position,
        );
        const checklist = (round.quality_checklist ?? {}) as Record<string, boolean>;

        return (
          <section
            key={round.id}
            style={{ borderTop: '2px solid var(--ink)', paddingTop: '1rem', marginTop: '2rem' }}
          >
            <div className="dateline" style={{ padding: 0 }}>
              <span>
                Round {String(round.position).padStart(2, '0')} ·{' '}
                {round.approved ? 'approved' : 'not approved'}
              </span>
              <span style={{ display: 'flex', gap: '0.6rem' }}>
                <form action={moveRoundAction}>
                  <input type="hidden" name="gameId" value={game.id} />
                  <input type="hidden" name="roundId" value={round.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button className="action--quiet" type="submit" aria-label="Move round earlier">
                    ↑
                  </button>
                </form>
                <form action={moveRoundAction}>
                  <input type="hidden" name="gameId" value={game.id} />
                  <input type="hidden" name="roundId" value={round.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button className="action--quiet" type="submit" aria-label="Move round later">
                    ↓
                  </button>
                </form>
              </span>
            </div>

            {roundIssues.map((issue, index) => (
              <p className="issue" data-level={issue.level} key={index}>
                {issue.message}
              </p>
            ))}

            <form action={saveRoundAction}>
              <input type="hidden" name="gameId" value={game.id} />
              <input type="hidden" name="roundId" value={round.id} />

              <div className="inline-form">
                <label className="field" style={{ maxWidth: '8rem' }}>
                  <span className="field__label">Difficulty</span>
                  <input type="number" name="difficulty" min={1} max={5} defaultValue={round.difficulty} />
                </label>
                <label className="field" style={{ maxWidth: '14rem' }}>
                  <span className="field__label">Round type</span>
                  <select name="roundType" defaultValue={round.round_type}>
                    {ROUND_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Word</th>
                    <th scope="col">Fake</th>
                    <th scope="col">Decoy</th>
                    <th scope="col">POS</th>
                    <th scope="col">Short definition</th>
                    <th scope="col">Expanded</th>
                  </tr>
                </thead>
                <tbody>
                  {options.map((option) => (
                    <tr key={option.id}>
                      <td>
                        <input
                          type="text"
                          name={`word_${option.id}`}
                          defaultValue={option.display_word}
                          style={{ width: '9rem', padding: '0.35rem' }}
                        />
                      </td>
                      <td>
                        <input
                          type="radio"
                          name="fakeOptionId"
                          value={option.id}
                          defaultChecked={round.fake_option_id === option.id}
                          aria-label={`${option.display_word} is the fabricated word`}
                        />
                      </td>
                      <td>
                        <input
                          type="radio"
                          name="decoyOptionId"
                          value={option.id}
                          defaultChecked={round.intended_decoy_option_id === option.id}
                          aria-label={`${option.display_word} is the intended decoy`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          name={`pos_${option.id}`}
                          defaultValue={option.part_of_speech ?? ''}
                          style={{ width: '5.5rem', padding: '0.35rem' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          name={`short_${option.id}`}
                          defaultValue={option.short_definition ?? ''}
                          style={{ width: '100%', padding: '0.35rem' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          name={`expanded_${option.id}`}
                          defaultValue={option.expanded_definition ?? ''}
                          style={{ width: '100%', padding: '0.35rem' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <label className="field">
                <span className="field__label">Why the fake is plausible</span>
                <textarea name="fakeRationale" rows={3} defaultValue={round.fake_rationale ?? ''} />
              </label>
              <label className="field">
                <span className="field__label">Why the decoy looks suspicious</span>
                <textarea name="decoyRationale" rows={3} defaultValue={round.decoy_rationale ?? ''} />
              </label>
              <label className="field">
                <span className="field__label">Editor notes</span>
                <input type="text" name="editorNotes" defaultValue={round.editor_notes ?? ''} />
              </label>

              <button type="submit" className="action action--ghost">
                Save round
              </button>
            </form>

            <form action={approveRoundAction} style={{ marginTop: '1rem' }}>
              <input type="hidden" name="gameId" value={game.id} />
              <input type="hidden" name="roundId" value={round.id} />
              <div className="checklist">
                {CHECKLIST.map(([name, label]) => (
                  <label key={name}>
                    <input type="checkbox" name={name} defaultChecked={checklist[name.slice(2)] ?? false} />
                    {label}
                  </label>
                ))}
              </div>
              <div className="toolbar">
                <label className="checklist">
                  <span style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <input type="checkbox" name="approved" defaultChecked={round.approved} />
                    Approve this round
                  </span>
                </label>
                <button type="submit" className="action--quiet">
                  Save review
                </button>
              </div>
            </form>
          </section>
        );
      })}
    </div>
  );
}
