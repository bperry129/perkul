import Link from 'next/link';

/**
 * The "not done playing?" panel — a blue-into-red card with soft circles
 * drifting behind the text.
 *
 * Shared by the played-today homepage and the results page, which is the whole
 * reason it is a component: both appear at the moment a player has just been
 * told the ranked game is over for the day, and they should look identical.
 *
 * No hooks and no state, so this renders inside a server component (page.tsx)
 * and a client component (ResultsView) alike. The motion is pure CSS —
 * `.archive-nudge` in globals.css — because seven looping circles are not worth
 * a single byte of JavaScript, and prefers-reduced-motion stops them.
 */

/**
 * The circles, hand-placed rather than generated. Random values would re-shuffle
 * on every render and, in a server component, differ between the server HTML and
 * the client — a hydration mismatch.
 *
 * Each one gets a position, a diameter, a tint, and a `dx`/`dy` it drifts by.
 * They are large and heavily blurred by the CSS, so most sit partly outside the
 * box and only their bloom shows; the point is colour shifting under the text,
 * not shapes crossing it. Durations are long (14–26s) and unrelated to each
 * other, so the panel never appears to loop.
 */
const ORBS = [
  // Blue, top-left through the middle.
  { x: '-6%', y: '-40%', size: '120px', tint: 'rgba(88, 140, 255, 0.85)', alpha: 0.5, dx: '26px', dy: '18px', dur: '19s', delay: '0s' },
  { x: '18%', y: '35%', size: '70px', tint: 'rgba(120, 170, 255, 0.7)', alpha: 0.4, dx: '-22px', dy: '-14px', dur: '23s', delay: '2s' },
  { x: '40%', y: '-25%', size: '90px', tint: 'rgba(70, 110, 235, 0.7)', alpha: 0.38, dx: '18px', dy: '24px', dur: '26s', delay: '4s' },
  // Red, centre through bottom-right.
  { x: '52%', y: '45%', size: '110px', tint: 'rgba(232, 70, 96, 0.8)', alpha: 0.5, dx: '-26px', dy: '-18px', dur: '21s', delay: '1s' },
  { x: '74%', y: '-20%', size: '86px', tint: 'rgba(214, 48, 82, 0.75)', alpha: 0.45, dx: '20px', dy: '22px', dur: '17s', delay: '3s' },
  { x: '88%', y: '52%', size: '130px', tint: 'rgba(255, 92, 110, 0.7)', alpha: 0.42, dx: '-18px', dy: '-22px', dur: '24s', delay: '5s' },
  // One pale bloom to lift the middle where the two colours meet.
  { x: '30%', y: '-10%', size: '64px', tint: 'rgba(255, 255, 255, 0.5)', alpha: 0.22, dx: '30px', dy: '12px', dur: '14s', delay: '6s' },
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
      <div className="archive-nudge__field" aria-hidden="true">
        {ORBS.map((orb, index) => (
          <span
            key={index}
            className="archive-nudge__orb"
            style={
              {
                '--x': orb.x,
                '--y': orb.y,
                '--size': orb.size,
                '--tint': orb.tint,
                '--alpha': orb.alpha,
                '--dx': orb.dx,
                '--dy': orb.dy,
                '--dur': orb.dur,
                '--delay': orb.delay,
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
