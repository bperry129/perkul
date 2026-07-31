import Link from 'next/link';

/**
 * The "not done playing?" panel, with bubbles drifting up behind the text.
 *
 * Shared by the played-today homepage and the results page, which is the whole
 * reason it is a component: both appear at the moment a player has just been
 * told the ranked game is over for the day, and they should look identical.
 *
 * No hooks and no state, so this renders inside a server component (page.tsx)
 * and a client component (ResultsView) alike. The animation is pure CSS —
 * `.archive-nudge` in globals.css — because six looping bubbles are not worth a
 * single byte of JavaScript, and prefers-reduced-motion switches them off.
 */

/**
 * Six bubbles, hand-tuned rather than generated. Random values would re-shuffle
 * on every render and, in a server component, differ between the server HTML and
 * the client, so these are fixed: position across the panel, size, how long a
 * rise takes, and a stagger so they never travel as a group.
 */
const BUBBLES = [
  { x: '6%', size: '10px', dur: '7.5s', delay: '0s' },
  { x: '22%', size: '16px', dur: '9.5s', delay: '1.4s' },
  { x: '41%', size: '7px', dur: '6.5s', delay: '2.6s' },
  { x: '58%', size: '13px', dur: '8.5s', delay: '0.7s' },
  { x: '76%', size: '9px', dur: '7s', delay: '3.4s' },
  { x: '90%', size: '18px', dur: '10.5s', delay: '2s' },
] as const;

export function ArchiveNudge({
  children,
  cta,
}: {
  children: React.ReactNode;
  /** Optional trailing link text; defaults to nothing so callers control the copy. */
  cta?: string;
}) {
  return (
    <div className="archive-nudge">
      {/* Decorative only — never announced, never clickable. */}
      <div className="archive-nudge__bubbles" aria-hidden="true">
        {BUBBLES.map((bubble, index) => (
          <span
            key={index}
            style={
              {
                '--x': bubble.x,
                '--size': bubble.size,
                '--dur': bubble.dur,
                '--delay': bubble.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <p style={{ margin: 0 }}>{children}</p>

      {cta ? (
        <p style={{ margin: '0.6rem 0 0' }}>
          <Link href="/archive">{cta}</Link>
        </p>
      ) : null}
    </div>
  );
}
