'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BRAND, gameLabel } from '@/lib/brand';
import { formatElapsed, formatSeconds } from '@/lib/time';
import type { AttemptResult, RoundResult } from '@/lib/types';

/* ------------------------------------------------------------------ marks -- */

function Reveal({ marks, animate }: { marks: boolean[]; animate: boolean }) {
  const [shown, setShown] = useState(animate ? 0 : marks.length);

  useEffect(() => {
    if (!animate) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(marks.length);
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= marks.length) window.clearInterval(id);
    }, 110);
    return () => window.clearInterval(id);
  }, [animate, marks.length]);

  return (
    <div className="reveal" aria-hidden="true">
      {marks.map((hit, index) => (
        <span key={index} data-shown={index < shown} data-hit={hit}>
          {hit ? '✓' : '✕'}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- one round -- */

function RoundEntry({ round }: { round: RoundResult }) {
  const missed = !round.isCorrect;
  const others = round.options.filter((o) => o.isReal && !o.isIntendedDecoy);

  return (
    <article className="roundup__entry" data-missed={missed}>
      <div className="roundup__head">
        <span className="roundup__number">
          ROUND {String(round.roundNumber).padStart(2, '0')}
        </span>
        <span className="roundup__verdict" data-missed={missed}>
          {missed ? 'Missed' : 'Correct'}
        </span>
      </div>

      <p className="roundup__words">
        {round.options.map((option, index) => (
          <span key={option.optionId}>
            <span
              className={[option.isFake ? 'is-fake' : '', option.wasSelected ? 'is-chosen' : '']
                .filter(Boolean)
                .join(' ')}
            >
              {option.word}
            </span>
            {index < round.options.length - 1 ? <span style={{ color: 'var(--gray-light)' }}> · </span> : null}
          </span>
        ))}
      </p>

      <dl className="callout">
        {missed ? (
          <>
            <dt>You chose</dt>
            <dd>
              <strong>{round.selectedWord ?? '—'}</strong>
            </dd>
          </>
        ) : null}
        <dt>The fake</dt>
        <dd>
          <strong>{round.fakeWord}</strong>
          {round.fakeRationale ? <div>{round.fakeRationale}</div> : null}
        </dd>
        {round.decoyWord ? (
          <>
            <dt>The trap</dt>
            <dd>
              <strong>{round.decoyWord}</strong>
              {round.decoyShortDefinition ? <div>{round.decoyShortDefinition}</div> : null}
              {round.decoyRationale ? <div>{round.decoyRationale}</div> : null}
            </dd>
          </>
        ) : null}
      </dl>

      {/* A missed round shows the relevant definition without any expanding. */}
      {missed
        ? round.options
            .filter((o) => o.isReal && o.wasSelected)
            .map((option) => (
              <div className="definition" key={option.optionId}>
                <span className="definition__word">{option.word}</span>
                {option.partOfSpeech ? (
                  <span className="definition__pos">{option.partOfSpeech}</span>
                ) : null}
                {option.expandedDefinition || option.shortDefinition}
              </div>
            ))
        : null}

      {round.stats ? (
        <div className="definition" style={{ borderTop: '1px solid var(--rule)' }}>
          <span className="label">Correct </span>
          {round.stats.correctPercent}%
          {round.stats.mostCommonWrongWord ? (
            <>
              {' · '}
              <span className="label">Most common wrong answer </span>
              {round.stats.mostCommonWrongWord} — {round.stats.mostCommonWrongPercent}%
            </>
          ) : null}
          <span className="label"> · {round.stats.sampleSize} players</span>
        </div>
      ) : null}

      <details className="expand">
        <summary>Explore all words</summary>
        {[...(round.decoyWord ? round.options.filter((o) => o.isIntendedDecoy) : []), ...others].map(
          (option) => (
            <div className="definition" key={option.optionId}>
              <span className="definition__word">{option.word}</span>
              {option.partOfSpeech ? (
                <span className="definition__pos">{option.partOfSpeech}</span>
              ) : null}
              {option.expandedDefinition || option.shortDefinition}
              {option.selectionPercent != null ? (
                <span className="label"> · {option.selectionPercent}% chose this</span>
              ) : null}
            </div>
          ),
        )}
      </details>
    </article>
  );
}

/* ---------------------------------------------------------------- sharing -- */

function ShareBlock({ result }: { result: AttemptResult }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: result.shareText });
        setState('idle');
        return;
      }
      await navigator.clipboard.writeText(result.shareText);
      setState('copied');
      window.setTimeout(() => setState('idle'), 2200);
    } catch {
      setState('failed');
    }
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'share_result', attemptId: result.attemptId }),
    });
  };

  return (
    <div className="share">
      <button type="button" className="action action--ghost" onClick={share}>
        {state === 'copied' ? 'Copied' : 'Share result'}
      </button>
      <div className="share__preview">{result.shareText}</div>
      {state === 'failed' ? (
        <p className="label">Copying is blocked in this browser - select the text above.</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- standings -- */

function Standing({ result }: { result: AttemptResult }) {
  const c = result.comparison;
  if (c.mode === 'off') return null;

  const rank = c.rank;
  const total = c.mode === 'real' ? c.total : (c.benchmarkPopulation ?? c.total);
  const beatPercent = c.beatPercent;

  return (
    <div className="standing">
      <span className="standing__value">
        #{rank?.toLocaleString()} of {total?.toLocaleString()}
      </span>
      <span className="standing__note">Today's players</span>
      {beatPercent != null ? (
        <span className="standing__note">You beat {beatPercent}% of players today</span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ view --- */

export function ResultsView({
  result,
  animate = false,
  showSignupCta = true,
  sharingEnabled = true,
  onPlayAgain,
}: {
  result: AttemptResult;
  animate?: boolean;
  showSignupCta?: boolean;
  sharingEnabled?: boolean;
  onPlayAgain?: () => void;
}) {
  const missedRounds = result.rounds.filter((r) => !r.isCorrect).map((r) => r.roundNumber);
  const records = result.records;

  return (
    <section>
      <div className="dateline">
        <span>{gameLabel(result.game.gameNumber)}</span>
        <span>{result.isRanked ? 'Ranked attempt' : 'Practice - unranked'}</span>
      </div>

      <Reveal marks={result.marks} animate={animate} />

      <div className="score">
        <div>
          <div className="score__value">
            {result.correctCount}/{result.roundsTotal}
          </div>
          <div className="score__time">{formatSeconds(result.elapsedMs)} SECONDS</div>
        </div>
        {result.grade ? <div className="score__grade">Grade {result.grade}</div> : null}
      </div>

      <p className="label">
        {result.correctCount === result.roundsTotal
          ? 'Clean.'
          : missedRounds.length === 1
            ? `Round ${missedRounds[0]} got you.`
            : `Missed rounds ${missedRounds.join(', ')}.`}
        {' · '}
        {formatElapsed(result.elapsedMs)}
      </p>

      <Standing result={result} />

      {records ? (
        <div className="records">
          {records.isFirstPerfect ? <span>First perfect game</span> : null}
          {records.isPersonalBestPerfect && !records.isFirstPerfect ? (
            <span>Fastest perfect game</span>
          ) : null}
          {records.isBestScore && !records.isFirstPerfect ? <span>New personal best</span> : null}
          {records.currentStreak > 1 ? <span>{records.currentStreak}-day streak</span> : null}
        </div>
      ) : null}

      {result.integrityStatus !== 'valid' ? (
        <div className="notice">
          This attempt is flagged for review, so it is not on the public leaderboard yet. Your score
          is still saved to your history.
        </div>
      ) : null}

      {sharingEnabled ? <ShareBlock result={result} /> : null}

      {/* Play again for fun */}
      {onPlayAgain ? (
        <div style={{ marginTop: '1.5rem' }}>
          <button type="button" className="action action--ghost" onClick={onPlayAgain}>
            Play again for fun
          </button>
          <p className="label" style={{ marginTop: '0.6rem' }}>
            Practice only - will not affect your score, rank or streak.
          </p>
        </div>
      ) : null}

      {/* Sign up CTA */}
      {!result.isAuthenticated && showSignupCta ? (
        <div className="cta">
          <h2 className="cta__title">Get on the leaderboard.</h2>
          <p style={{ color: 'var(--ink-soft)' }}>
            Create a free account, pick your leaderboard name, and your{' '}
            {result.correctCount}/{result.roundsTotal} in {formatSeconds(result.elapsedMs)}s is
            saved - plus your streak and history across devices.
          </p>
          <Link className="action" href="/login?claim=1">
            Choose my name and save my score
          </Link>
        </div>
      ) : null}

      <div className="roundup">
        <h2 className="admin-title" style={{ fontSize: '1.4rem', margin: '2.5rem 0 0.5rem' }}>
          What fooled you
        </h2>
        <p className="label">Every round, the fake word, and the trap that was set for you.</p>
        {result.rounds.map((round) => (
          <RoundEntry key={round.roundId} round={round} />
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        {/* Plain <a> for the same reason as the header link: a client-side
            navigation can render a reused RSC payload of the board. */}
        <a className="action action--ghost" href="/leaderboard">
          Today's leaderboard
        </a>
        <Link className="action--quiet" href="/how-to-play">
          What counts as a word in {BRAND.name}?
        </Link>
      </div>
    </section>
  );
}
