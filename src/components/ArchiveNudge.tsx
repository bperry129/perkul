import Link from 'next/link';

/**
 * The "not done playing?" panel — a dark blue-to-red card with a faint
 * starfield behind the text.
 *
 * Shared by the played-today homepage and the results page, which is the whole
 * reason it is a component: both appear at the moment a player has just been
 * told the ranked game is over for the day, and they should look identical.
 *
 * No hooks and no state, so this renders inside a server component (page.tsx)
 * and a client component (ResultsView) alike. The starfield is pure CSS —
 * `.archive-nudge` in globals.css — because a handful of looping points are not
 * worth a single byte of JavaScript, and prefers-reduced-motion stills them.
 */

/**
 * Star positions, hand-placed rather than generated. Random values would
 * re-shuffle on every render and, in a server component, differ between the
 * server HTML and the client — a hydration mismatch. Each gets fixed
 * co-ordinates, a size, a duration and an offset delay; the delays are
 * deliberately unrelated so the field never pulses in unison.
 *
 * They are spread thinly and kept away from dead centre, since this sits behind
 * two or three lines of copy and the text has to win.
 */
const STARS = [
  { x: '5%', y: '20%', size: '2px', dur: '4.2s', delay: '0s' },
  { x: '13%', y: '72%', size: '1px', dur: '5.4s', delay: '1.6s' },
  { x: '24%', y: '14%', size: '1px', dur: '4.8s', delay: '3.1s' },
  { x: '33%', y: '84%', size: '2px', dur: '6.1s', delay: '0.8s' },
  { x: '46%', y: '10%', size: '1px', dur: '4.5s', delay: '2.3s' },
  { x: '55%', y: '78%', size: '1px', dur: '5.7s', delay: '3.8s' },
  { x: '67%', y: '22%', size: '2px', dur: '4.9s', delay: '1.1s' },
  { x: '74%', y: '66%', size: '1px', dur: '6.4s', delay: '2.7s' },
  { x: '83%', y: '32%', size: '1px', dur: '4.4s', delay: '0.4s' },
  { x: '91%', y: '80%', size: '2px', dur: '5.9s', delay: '3.4s' },
  { x: '97%', y: '46%', size: '1px', dur: '5.1s', delay: '1.9s' },
] as const;

export function ArchiveNudge({
  children,
  cta,
}: {
  children: React.ReactNode;
  /** Optional trailing link text; omitted when the caller supplies its own. */
  cta?: string;
}) {
  return (
    <div className="archive-nudge">
      {/* Decorative only — never announced, never clickable. */}
      <div className="archive-nudge__sky" aria-hidden="true">
        {STARS.map((star, index) => (
          <span
            key={index}
            className="archive-nudge__star"
            style={
              {
                '--x': star.x,
                '--y': star.y,
                '--size': star.size,
                '--dur': star.dur,
                '--delay': star.delay,
              } as React.CSSProperties
            }
          />
        ))}

        {/* A single streak on a 14s cycle — visible for about a second of it. */}
        <span
          className="archive-nudge__shoot"
          style={{ '--x': '-6%', '--y': '24%', '--dur': '14s', '--delay': '4s' } as React.CSSProperties}
        />
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
