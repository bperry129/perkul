import Link from 'next/link';

/**
 * The "not done playing?" panel — a pale blush card with a red hairline border
 * and soft circles roaming behind the text.
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
 * box and only their bloom shows. On a pale background the opacities have to be
 * very low — 0.1–0.2, against 0.4–0.55 when the panel was saturated — or the
 * blooms turn into visible blobs sliding behind the words. What is left is a
 * faint shift in warmth, closer to light moving across a surface than to
 * animation.
 *
 * Travel stays generous (60–90px) but the cycles are slower again (11–19s), and
 * the durations are unrelated to each other so the panel never settles into a
 * visible loop. Tints are rose and apricot with one cool blue for depth; pure
 * white would do nothing here, since the background is already nearly white.
 */
const ORBS = [
  { x: '-8%', y: '-45%', size: '130px', tint: 'rgba(226, 88, 112, 0.55)', alpha: 0.2, dx: '74px', dy: '42px', dur: '15s', delay: '0s' },
  { x: '20%', y: '30%', size: '78px', tint: 'rgba(240, 140, 120, 0.5)', alpha: 0.16, dx: '-68px', dy: '-36px', dur: '17s', delay: '0.9s' },
  { x: '42%', y: '-30%', size: '96px', tint: 'rgba(214, 70, 96, 0.5)', alpha: 0.14, dx: '62px', dy: '58px', dur: '19s', delay: '2.1s' },
  { x: '55%', y: '42%', size: '112px', tint: 'rgba(232, 104, 128, 0.5)', alpha: 0.18, dx: '-84px', dy: '-46px', dur: '14s', delay: '0.4s' },
  { x: '76%', y: '-22%', size: '88px', tint: 'rgba(244, 156, 128, 0.5)', alpha: 0.15, dx: '66px', dy: '60px', dur: '12s', delay: '2.6s' },
  { x: '90%', y: '48%', size: '134px', tint: 'rgba(220, 80, 104, 0.5)', alpha: 0.17, dx: '-76px', dy: '-52px', dur: '18s', delay: '1.3s' },
  // One cool bloom so the warmth has something to sit against.
  { x: '32%', y: '-12%', size: '70px', tint: 'rgba(120, 150, 230, 0.45)', alpha: 0.1, dx: '88px', dy: '32px', dur: '11s', delay: '3.2s' },
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
