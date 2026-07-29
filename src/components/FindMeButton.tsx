'use client';

import { useState } from 'react';

/**
 * "Find me" — jumps to the player's own row on a long board.
 *
 * The boards render every player on one scrollable page, so on a busy day your
 * own row can be hundreds of rows down. This scrolls straight to it and flashes
 * it once.
 *
 * It targets `[data-you="true"]`, the same attribute the highlight styling uses,
 * so there is exactly one definition of "this row is you". The server only
 * renders this button when it has already established the player is on the
 * board, so it is never a button that does nothing — the not-found message is a
 * backstop, not the expected path.
 */
export function FindMeButton({ label = 'Find me' }: { label?: string }) {
  const [missing, setMissing] = useState(false);

  const find = () => {
    const row = document.querySelector<HTMLElement>('[data-you="true"]');
    if (!row) {
      setMissing(true);
      return;
    }
    setMissing(false);

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    row.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });

    // Move keyboard and screen-reader focus as well, not just the viewport,
    // otherwise the jump means nothing to anyone not using a mouse.
    row.tabIndex = -1;
    row.focus({ preventScroll: true });

    row.setAttribute('data-flash', 'true');
    window.setTimeout(() => row.removeAttribute('data-flash'), 1400);
  };

  return (
    <>
      <button type="button" className="action action--ghost action--small" onClick={find}>
        {label}
      </button>
      {missing ? (
        <p className="label" role="status">
          Your row is not on this board yet.
        </p>
      ) : null}
    </>
  );
}
