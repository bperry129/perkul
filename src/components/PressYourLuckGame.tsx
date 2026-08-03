'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { bustChanceForScore, MAX_BUST_CHANCE } from '@/lib/press-your-luck-math';
import { BRAND } from '@/lib/brand';

/** The score that wins the $25 Amazon gift card — see the giveaway rules at
 * the bottom of `/games/press-your-luck`. Kept here, not hard-coded twice,
 * so the button's own celebration message and the rules text can never
 * disagree about the number. */
export const GIVEAWAY_SCORE = 31;

/**
 * A quality-random 0..100 roll for "did this press bust the run". Not
 * cryptographic-grade needed here — `crypto.getRandomValues` is used simply
 * because it's already the right tool sitting on `window`, with `Math.random`
 * as a fallback for any environment missing it.
 */
function randomPercent(): number {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    return (buf[0] / 0xffffffff) * 100;
  }
  return Math.random() * 100;
}

/** Green at zero risk, sliding to red as the bust chance climbs to its cap. */
function riskColor(chancePercent: number): string {
  const t = Math.min(1, chancePercent / MAX_BUST_CHANCE);
  const hue = 150 - 150 * t; // 150 (mint green) -> 0 (red)
  const light = 45 - 3 * t;
  return `hsl(${hue.toFixed(0)}, 68%, ${light.toFixed(0)}%)`;
}

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
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wonThisRun, setWonThisRun] = useState(false);

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

  const submitRun = useCallback(async (finalScore: number) => {
    if (finalScore <= 0) return;
    setSubmitting(true);
    try {
      await fetch('/api/press-your-luck/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ score: finalScore, endedReason: 'bust' }),
      });
    } catch {
      /* best effort — the run still happened for the player, just not the board */
    } finally {
      setSubmitting(false);
    }
  }, []);

  const press = useCallback(() => {
    if (busted || submitting) return;

    setPressed(true);
    schedule(() => setPressed(false), 110);
    playClick();

    const chance = bustChanceForScore(score);
    const roll = randomPercent();

    if (roll < chance) {
      schedule(playBust, 70);
      setBusted(true);
      setMessage(`Busted at ${score}.`);
      void submitRun(score);
      schedule(() => {
        setBusted(false);
        setScore(0);
        setWonThisRun(false);
      }, 850);
    } else {
      const next = score + 1;
      setScore(next);
      setSessionBest((s) => Math.max(s, next));

      if (next === GIVEAWAY_SCORE && !wonThisRun) {
        setWonThisRun(true);
        playWin();
        setMessage(
          isSignedIn
            ? `You reached ${GIVEAWAY_SCORE}! Email ${BRAND.email} from your account's address to claim your $25 Amazon gift card.`
            : `You reached ${GIVEAWAY_SCORE} — but you need to be signed in to qualify for the prize. Sign in and do it again!`,
        );
      }
    }
  }, [busted, isSignedIn, playBust, playClick, playWin, schedule, score, submitRun, submitting, wonThisRun]);

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
          disabled={submitting}
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
