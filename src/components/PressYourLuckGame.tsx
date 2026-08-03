'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { bustChanceForScore, MAX_BUST_CHANCE } from '@/lib/press-your-luck-math';
import { BRAND } from '@/lib/brand';

/** The score that wins the $25 Amazon gift card — see the giveaway rules at
 * the bottom of `/games/press-your-luck`. Kept here, not hard-coded twice,
 * so the button's own celebration message and the rules text can never
 * disagree about the number. */
export const GIVEAWAY_SCORE = 35;

type PressResponse = {
  ok: boolean;
  busted?: boolean;
  ignored?: boolean;
  score?: number;
  token?: string;
};

/** Green at zero risk, sliding to red as the bust chance climbs to its cap. */
function riskColor(chancePercent: number): string {
  const t = Math.min(1, chancePercent / MAX_BUST_CHANCE);
  const hue = 150 - 150 * t; // 150 (mint green) -> 0 (red)
  const light = 45 - 3 * t;
  return `hsl(${hue.toFixed(0)}, 68%, ${light.toFixed(0)}%)`;
}

/**
 * The button only ever *asks* the server what happened; it never decides.
 * See src/app/api/press-your-luck/press/route.ts — every roll, the bust
 * decision, and the score itself are all authoritative there, not here.
 * This component's own `bustChanceForScore` call below is display-only: it
 * shows the player the same number the server is about to use, computed
 * from the same shared, non-secret formula, but the server's roll is what
 * actually decides the outcome.
 */
export function PressYourLuckGame({
  myBestScore,
  isSignedIn,
}: {
  myBestScore: number | null;
  isSignedIn: boolean;
}) {
  const [score, setScore] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [busted, setBusted] = useState(false);
  const [sessionBest, setSessionBest] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wonThisRun, setWonThisRun] = useState(false);

  const tokenRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      void audioCtxRef.current?.close();
    };
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  const ensureAudio = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    return audioCtxRef.current;
  }, []);

  /** A short, satisfying "tick" — every single press, win or lose. */
  const playClick = useCallback(() => {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.06);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }, [ensureAudio]);

  /** A falling "womp" the instant a run busts. */
  const playBust = useCallback(() => {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.42);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }, [ensureAudio]);

  /** A bright chime the instant a run reaches the giveaway score. */
  const playWin = useCallback(() => {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    [520, 660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);
      gain.gain.setValueAtTime(0.13, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.32);
    });
  }, [ensureAudio]);

  const press = useCallback(async () => {
    if (busted || busy) return;

    setBusy(true);
    setPressed(true);
    schedule(() => setPressed(false), 110);
    playClick();

    try {
      const res = await fetch('/api/press-your-luck/press', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: tokenRef.current }),
      });
      const data = (await res.json()) as PressResponse;

      if (!res.ok || !data.ok) {
        // Session couldn't be verified (or something else went wrong
        // server-side) — the only safe move is to start over, the same as
        // if this had been the very first press.
        tokenRef.current = null;
        setScore(0);
        setMessage('Something interrupted that run — press again to start fresh.');
        return;
      }

      if (data.ignored) {
        // Too fast to be a real press; state is unchanged.
        return;
      }

      if (data.busted) {
        schedule(playBust, 70);
        setBusted(true);
        setMessage(`Busted at ${data.score ?? score}.`);
        tokenRef.current = null;
        schedule(() => {
          setBusted(false);
          setScore(0);
          setWonThisRun(false);
        }, 850);
        return;
      }

      const nextScore = data.score ?? score + 1;
      tokenRef.current = data.token ?? null;
      setScore(nextScore);
      setSessionBest((s) => Math.max(s, nextScore));

      if (nextScore === GIVEAWAY_SCORE && !wonThisRun) {
        setWonThisRun(true);
        playWin();
        setMessage(
          isSignedIn
            ? `You reached ${GIVEAWAY_SCORE}! Email ${BRAND.email} from your account's address to claim your $25 Amazon gift card.`
            : `You reached ${GIVEAWAY_SCORE} — but you need to be signed in to qualify for the prize. Sign in and do it again!`,
        );
      }
    } catch {
      setMessage('Network hiccup — press again.');
    } finally {
      setBusy(false);
    }
  }, [busted, busy, isSignedIn, playBust, playClick, playWin, schedule, score, wonThisRun]);

  const chance = bustChanceForScore(score);
  const color = riskColor(chance);

  return (
    <section className="pyl">
      <div className="pyl__stage">
        <div className="pyl__readout">
          <div className="pyl__score" aria-live="polite">
            {score}
          </div>
          <span className="pyl__score-label">Current score</span>
        </div>

        <button
          type="button"
          className="pyl__button"
          data-pressed={pressed}
          data-busted={busted}
          style={{ backgroundColor: busted ? 'var(--miss)' : color }}
          onClick={press}
          disabled={busy || busted}
          aria-label={busted ? 'Busted — resetting' : `Press. Current bust chance ${chance}%`}
        >
          <span className="pyl__button-label">{busted ? 'BUSTED' : 'PRESS'}</span>
        </button>

        <div className="pyl__meter">
          <div className="pyl__meter-row">
            <span>Next-press bust chance</span>
            <span className="pyl__meter-value">{chance}%</span>
          </div>
          <div className="pyl__meter-track">
            <div
              className="pyl__meter-fill"
              style={{ width: `${(chance / MAX_BUST_CHANCE) * 100}%`, backgroundColor: color }}
            />
          </div>
        </div>
      </div>

      <p className="label" style={{ marginTop: '1.2rem', textAlign: 'center' }}>
        Session best: {sessionBest}
        {myBestScore != null ? <> · Your all-time best: {myBestScore}</> : null}
      </p>

      {message ? (
        <p className="pyl__toast" role="status">
          {message}
          {!isSignedIn && wonThisRun ? (
            <>
              {' '}
              <Link href="/login">Sign in →</Link>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
