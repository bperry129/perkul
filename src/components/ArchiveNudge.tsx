import Link from 'next/link';

/**
 * The "not done playing?" panel — a red card with a blue border and soft
 * circles roaming behind the text.
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
 * Each one gets a position, a diameter, a tint, and a `dx`/`dy` it travels by.
 * They are large and heavily blurred by the CSS, so most sit partly outside the
 * box and only their bloom shows; the point is colour moving under the text, not
 * shapes crossing it. That blur is also what lets them travel this far — 70–130px
 * over 7–13s is real movement, but with no hard edge to track it still reads as
 * the background churning rather than objects flying past. Durations are prime-ish
 * and unrelated, so the panel never settles into a visible loop.
 *
 * Tints are blue and pale on a red ground: the reds that were here before are
 * now invisible against the gradient, and the blue ties the motion to the border.
 */
const ORBS = [
  { x: '-8%', y: '-45%', size: '130px', tint: 'rgba(74, 123, 240, 0.95)', alpha: 0.55, dx: '96px', dy: '54px', dur: '9s', delay: '0s' },
  { x: '20%', y: '30%', size: '78px', tint: 'rgba(130, 175, 255, 0.85)', alpha: 0.45, dx: '-88px', dy: '-46px', dur: '11s', delay: '0.7s' },
  { x: '42%', y: '-30%', size: '96px', tint: 'rgba(58, 100, 225, 0.85)', alpha: 0.42, dx: '74px', dy: '68px', dur: '13s', delay: '1.6s' },
  { x: '55%', y: '42%', size: '112px', tint: 'rgba(96, 140, 250, 0.9)', alpha: 0.5, dx: '-104px', dy: '-58px', dur: '10s', delay: '0.3s' },
  { x: '76%', y: '-22%', size: '88px', tint: 'rgba(150, 190, 255, 0.8)', alpha: 0.44, dx: '82px', dy: '72px', dur: '8s', delay: '2.2s' },
  { x: '90%', y: '48%', size: '134px', tint: 'rgba(70, 118, 235, 0.9)', alpha: 0.46, dx: '-92px', dy: '-64px', dur: '12s', delay: '1.1s' },
  // A pale bloom, faster than the rest, to keep the middle from going flat.
  { x: '32%', y: '-12%', size: '70px', tint: 'rgba(255, 255, 255, 0.6)', alpha: 0.26, dx: '112px', dy: '40px', dur: '7s', delay: '2.8s' },
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
