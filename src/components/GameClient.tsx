'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BRAND, gameLabel } from '@/lib/brand';
import { formatElapsed } from '@/lib/time';
import type { ActiveAttemptPayload, AttemptResult, PublicGameSummary } from '@/lib/types';
import { ResultsView } from './ResultsView';



type Phase = 'idle' | 'starting' | 'playing' | 'submitting' | 'done';

type LocalAnswer = { roundId: string; optionId: string; elapsedAtMs: number };

const PENDING_KEY = 'perkul.pending-completion';

function loadPending(): { attemptId: string; answers: LocalAnswer[]; clientElapsedMs: number } | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePending(payload: { attemptId: string; answers: LocalAnswer[]; clientElapsedMs: number }) {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    /* private browsing — the server already has every committed answer */
  }
}

function clearPending() {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* noop */
  }
}

export function GameClient({
  game,
  initialAttempt,
  initialResult,
  showSignupCta,
  sharingEnabled,
  embed,
}: {
  game: PublicGameSummary | null;
  initialAttempt: ActiveAttemptPayload | null;
  initialResult: AttemptResult | null;
  showSignupCta: boolean;
  sharingEnabled: boolean;
  /**
   * Set only by `src/app/embed/daily/page.tsx`. `key` rides along on the
   * `/api/attempt/start` request so the server — never the browser — decides
   * which publisher (if any) this play is attributed to, and switches the
   * anon-session cookie to the cross-site-safe `SameSite=None; Partitioned`
   * variant. See docs/widget-handoff.md.
   */
  embed?: { key: string };
}) {

  const [phase, setPhase] = useState<Phase>(
    initialResult ? 'done' : initialAttempt ? 'playing' : 'idle',
  );
  const [attempt, setAttempt] = useState<ActiveAttemptPayload | null>(initialAttempt);
  const [result, setResult] = useState<AttemptResult | null>(initialResult);
  const [roundIndex, setRoundIndex] = useState(initialAttempt?.answeredRoundIds.length ?? 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const answersRef = useRef<LocalAnswer[]>([]);
  const skewRef = useRef(0);
  const committing = useRef(false);

  /* -------------------------------------------------------------- the clock */
  // The server owns the authoritative time. We only mirror it smoothly, using
  // the measured clock skew so a wrong device clock cannot help or hurt.
  useEffect(() => {
    if (!attempt) return;
    skewRef.current = Date.parse(attempt.serverNow) - Date.now();
  }, [attempt]);

  useEffect(() => {
    if (phase !== 'playing' || !attempt) return;
    const startedAt = Date.parse(attempt.startedAt);
    const tick = () => setElapsed(Math.max(0, Date.now() + skewRef.current - startedAt));
    tick();
    const id = window.setInterval(tick, 47);
    return () => window.clearInterval(id);
  }, [phase, attempt]);

  /* ------------------------------------------------- resilience on mount --- */
  useEffect(() => {
    const pending = loadPending();
    if (!pending || initialResult) {
      if (initialResult) clearPending();
      return;
    }
    void submitCompletion(pending.attemptId, pending.answers, pending.clientElapsedMs, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentRound = attempt?.rounds[roundIndex] ?? null;

  /* ------------------------------------------------------------------ start */
  const start = useCallback(async (practice = false) => {
    setError(null);
    setPhase('starting');
    try {
      const response = await fetch('/api/attempt/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gameId: game?.gameId,
          ...(practice ? { practice: true } : {}),
          // Resolved server-side against the publisher registry — see the
          // comment on the route handler. Sending the key, not an id, is the
          // point: the id is never something the browser gets to assert.
          ...(embed ? { embedKey: embed.key } : {}),
        }),
      });

      const payload = (await response.json()) as
        | { ok: true; attempt: ActiveAttemptPayload }
        | { ok: false; message: string };

      if (!response.ok || !('ok' in payload) || !payload.ok) {
        setError(('message' in payload && payload.message) || 'Could not start the game.');
        setPhase('idle');
        return;
      }

      answersRef.current = [];
      setAttempt(payload.attempt);
      setRoundIndex(payload.attempt.answeredRoundIds.length);
      setSelected(null);
      setResult(null);
      setPhase('playing');
    } catch {
      setError('Network problem. Check your connection and try again.');
      setPhase('idle');
    }
  }, [game?.gameId]);

  /* --------------------------------------------------------- play again (for fun) */
  const playAgain = useCallback(() => {
    setResult(null);
    setAttempt(null);
    setRoundIndex(0);
    setSelected(null);
    setError(null);
    answersRef.current = [];
    void start(true); // explicitly request practice mode
  }, [start]);

  /* --------------------------------------------------------------- complete */
  const submitCompletion = useCallback(
    async (
      attemptId: string,
      answers: LocalAnswer[],
      clientElapsedMs: number,
      quiet = false,
    ) => {
      if (!quiet) setPhase('submitting');
      savePending({ attemptId, answers, clientElapsedMs });

      for (let attemptNo = 0; attemptNo < 5; attemptNo += 1) {
        try {
          const response = await fetch('/api/attempt/complete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ attemptId, answers, clientElapsedMs }),
          });
          const payload = (await response.json()) as
            | { ok: true; result: AttemptResult }
            | { ok: false; message: string };

          if (response.ok && 'ok' in payload && payload.ok) {
            clearPending();
            setResult(payload.result);
            setPhase('done');
            window.scrollTo({ top: 0, behavior: 'auto' });
            return;
          }
          if (response.status === 404 || response.status === 400) {
            clearPending();
            if (!quiet) {
              setError(('message' in payload && payload.message) || 'Could not submit your game.');
              setPhase('playing');
            }
            return;
          }
        } catch {
          /* retry below */
        }
        await new Promise((resolve) => window.setTimeout(resolve, 600 * 2 ** attemptNo));
      }

      if (!quiet) {
        setError(
          'Your game is finished and saved locally, but we could not reach the server. It will retry automatically.',
        );
      }
    },
    [],
  );

  /* ----------------------------------------------------------------- select */
  const choose = useCallback(
    (optionId: string) => {
      if (phase !== 'playing' || selected || committing.current || !attempt || !currentRound) return;

      committing.current = true;
      setSelected(optionId);

      const elapsedAtMs = Math.max(
        0,
        Date.now() + skewRef.current - Date.parse(attempt.startedAt),
      );
      const answer: LocalAnswer = { roundId: currentRound.roundId, optionId, elapsedAtMs };
      answersRef.current = [...answersRef.current, answer];

      // Commit to the server immediately; correctness is never returned.
      void fetch('/api/attempt/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          attemptId: attempt.attemptId,
          roundId: currentRound.roundId,
          optionId,
          elapsedAtMs,
          roundNumber: currentRound.roundNumber,
          displayPosition:
            currentRound.options.findIndex((o) => o.id === optionId) + 1 || undefined,
        }),
      }).catch(() => {
        /* the completion call carries every answer as a backstop */
      });

      const isLast = roundIndex + 1 >= attempt.rounds.length;

      window.setTimeout(() => {
        committing.current = false;
        setSelected(null);
        if (isLast) {
          void submitCompletion(attempt.attemptId, answersRef.current, elapsedAtMs);
        } else {
          setRoundIndex((index) => index + 1);
        }
      }, 140);
    },
    [attempt, currentRound, phase, roundIndex, selected, submitCompletion],
  );

  /* -------------------------------------------------------------- keyboard */
  useEffect(() => {
    if (phase !== 'playing' || !currentRound) return;
    const onKey = (event: KeyboardEvent) => {
      const index = ['1', '2', '3', '4', '5'].indexOf(event.key);
      if (index === -1) return;
      const option = currentRound.options[index];
      if (option) {
        event.preventDefault();
        choose(option.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose, currentRound, phase]);

  const marks = useMemo(
    () => (attempt ? attempt.rounds.map((_, index) => index < roundIndex) : []),
    [attempt, roundIndex],
  );

  /* ------------------------------------------------- chrome while playing --- */
  // The press badge lives outside this component, on the green below the card,
  // so it cannot be conditionally rendered from in here. Flag the body instead
  // and let CSS pull it while the clock is running: nothing but the ten words
  // during a timed round.
  useEffect(() => {
    const playing = phase === 'playing' || phase === 'submitting';
    if (playing) document.body.dataset.playing = 'true';
    else delete document.body.dataset.playing;
    return () => {
      delete document.body.dataset.playing;
    };
  }, [phase]);

  /* -------------------------------------------------------- embed resizing */
  // A fixed-height iframe breaks the moment a mobile news layout reflows the
  // content taller than whatever the publisher guessed. embed.js listens for
  // this message and resizes the <iframe> to match; nothing on perkul.com
  // itself needs it, so the effect is a no-op whenever `embed` is unset.
  useEffect(() => {
    if (!embed || typeof window === 'undefined' || window.parent === window) return;

    const post = () => {
      const height = document.documentElement.scrollHeight;
      window.parent.postMessage({ source: 'perkul-embed', type: 'height', height }, '*');
    };

    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    window.addEventListener('load', post);
    return () => {
      observer.disconnect();
      window.removeEventListener('load', post);
    };
  }, [embed, phase, roundIndex]);

  /* --------------------------------------------------- publisher page report */
  // Tells the attribution crawler which real, on-the-open-web URL this embed
  // is running on. `document.referrer` is the parent page's own URL for a
  // plain cross-origin <iframe> navigation — no postMessage handshake with
  // embed.js required — unless the publisher sends
  // `Referrer-Policy: no-referrer`, in which case there is nothing to report
  // and this silently does nothing. Fires once per mount; the crawler, not
  // this effect, decides whether the link is actually present.
  useEffect(() => {
    if (!embed || typeof document === 'undefined' || !document.referrer) return;
    void fetch('/api/embed/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: embed.key, pageUrl: document.referrer }),
    }).catch(() => {
      /* best-effort; the crawler simply has one less page to check */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embed]);

  /* ------------------------------------------------------------------ views */


  if (phase === 'done' && result) {
    return (
      <ResultsView
        result={result}
        animate
        showSignupCta={showSignupCta}
        sharingEnabled={sharingEnabled}
        onPlayAgain={playAgain}
        embed={Boolean(embed)}
      />
    );
  }


  if (phase === 'submitting') {
    return (
      <section style={{ padding: '4rem 0' }}>
        <p className="loader">Marking your paper...</p>
        {error ? <div className="notice">{error}</div> : null}
      </section>
    );
  }

  if (phase === 'playing' && attempt && currentRound) {
    return (
      <section>
        {!attempt.isRanked ? (
          <div className="notice notice--quiet" style={{ marginBottom: '0.5rem' }}>
            Practice run - this will not be ranked or added to the leaderboard.
          </div>
        ) : null}

        <div className="game-head">
          <span className="game-head__id">{gameLabel(attempt.game.gameNumber)}</span>
          <div className="game-head__meta">
            <span className="meter">
              <span className="meter__label">Round</span>
              <span className="meter__value">
                {String(currentRound.roundNumber).padStart(2, '0')} / {attempt.rounds.length}
              </span>
            </span>
            <span className="meter">
              <span className="meter__label">Time</span>
              <span className="meter__value" aria-hidden="true">
                {formatElapsed(elapsed)}
              </span>
            </span>
          </div>
        </div>

        <div className="progress-rules" aria-hidden="true">
          {marks.map((done, index) => (
            <span key={index} data-done={done} data-current={index === roundIndex} />
          ))}
        </div>

        <h1
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
          }}
        >
          Round {currentRound.roundNumber} of {attempt.rounds.length}. Choose the fake word.
        </h1>

        <div className="game-prompt">
          Choose the fake word
        </div>

        <ul className="options">
          {currentRound.options.map((option, index) => (
            <li className="option" key={option.id}>
              <button
                type="button"
                className="option__button"
                data-chosen={selected === option.id}
                disabled={Boolean(selected)}
                onClick={() => choose(option.id)}
                aria-label={`Option ${index + 1}: ${option.word}`}
              >
                <span className="option__index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="option__word">{option.word}</span>
                <span className="option__mark" aria-hidden="true">
                  ⌐
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="keyhint">
          One choice per round · keys 1-5 · no feedback until round {attempt.rounds.length}
        </p>
        {error ? <div className="notice">{error}</div> : null}
      </section>
    );
  }

  /* idle / intro */
  return (
    <section>
      <div className="dateline">
        <span>{game ? gameLabel(game.gameNumber) : BRAND.name}</span>
        <span>{BRAND.rule}</span>
      </div>

      <h1 className="lede">
        One of these words <em>isn't real</em>.
      </h1>
      <p className="standfirst">
        Ten rounds. Five words each. Choose the fake word. You get a single choice per round and
        you will not find out how you did until the tenth. Get the most right in the fastest time
        and see where you place on the leaderboard.
      </p>

      {error ? <div className="notice">{error}</div> : null}

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        <button
          type="button"
          className="action"
          onClick={() => start()}
          disabled={phase === 'starting' || !game}
        >
          {phase === 'starting' ? 'Starting...' : 'Start today\'s game'}
        </button>
        {/* Outside `/embed/*`, so a same-frame navigation there would hit
            X-Frame-Options: SAMEORIGIN and go blank — see the note on
            ResultsView's `embed` prop. */}
        <Link
          className="action--quiet"
          href="/how-to-play"
          {...(embed ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          How to play
        </Link>

      </div>

      <p className="clocknote" style={{ marginTop: '1.5rem' }}>
        The clock starts when you press start.
      </p>
    </section>

  );
}
