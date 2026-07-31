/**
 * Ambient bubbles — slow, faint circles floating in the green margins either
 * side of the page.
 *
 * Purely atmospheric: it gives the empty green some life on wide screens without
 * putting anything near the words. Three rules keep it from becoming a nuisance:
 *
 *  1. It lives in the gutters only. Each side is a fixed column whose width is
 *     whatever is left over after the centre column is reserved, and each column
 *     clips its contents — so a bubble physically cannot drift across the card,
 *     no matter how the numbers below are tweaked.
 *  2. It disappears entirely below 68rem, where there are no gutters to float in.
 *     `display: none` rather than opacity, so phones do not animate anything.
 *  3. It disappears while the clock is running (`body[data-playing]`), like the
 *     press badge. Nothing moves on screen during a timed round.
 *
 * Rendered once in the root layout, behind everything on `z-index: -1`. No
 * hooks, no state, no JavaScript at all — the motion is CSS, and
 * prefers-reduced-motion stops it dead. See `.bubbles` in globals.css.
 */

/**
 * Hand-placed, not generated: random values would differ between the server
 * render and the client and trip a hydration mismatch, and would also re-shuffle
 * on every navigation.
 *
 * `x`/`y` are percentages of the gutter, so the layout adapts to whatever width
 * the margin happens to be. Bubbles drift mostly upward (negative `dy`) at
 * wildly different speeds — 22–38s — so the two sides never fall into step.
 * Opacities are 0.05–0.13: on the mid-green canvas that is just enough to read
 * as a shape catching the light, and not enough to look like a graphic.
 */
/** One circle. All values are CSS strings, handed to the stylesheet as vars. */
type Bubble = {
  x: string;
  y: string;
  size: string;
  tint: string;
  alpha: number;
  blur: string;
  dx: string;
  dy: string;
  dur: string;
  delay: string;
};

const LEFT: readonly Bubble[] = [
  { x: '18%', y: '8%', size: '120px', tint: 'rgba(255, 255, 255, 0.55)', alpha: 0.1, blur: '12px', dx: '22px', dy: '-90px', dur: '30s', delay: '0s' },
  { x: '52%', y: '26%', size: '64px', tint: 'rgba(240, 180, 41, 0.5)', alpha: 0.11, blur: '9px', dx: '-18px', dy: '-70px', dur: '24s', delay: '2.5s' },
  { x: '6%', y: '45%', size: '150px', tint: 'rgba(255, 255, 255, 0.4)', alpha: 0.07, blur: '16px', dx: '30px', dy: '-110px', dur: '38s', delay: '1.2s' },
  { x: '60%', y: '62%', size: '86px', tint: 'rgba(150, 205, 255, 0.5)', alpha: 0.09, blur: '11px', dx: '-24px', dy: '-84px', dur: '27s', delay: '4s' },
  { x: '24%', y: '78%', size: '104px', tint: 'rgba(255, 255, 255, 0.5)', alpha: 0.08, blur: '13px', dx: '18px', dy: '-96px', dur: '33s', delay: '0.6s' },
  { x: '46%', y: '92%', size: '58px', tint: 'rgba(255, 170, 180, 0.5)', alpha: 0.1, blur: '8px', dx: '-14px', dy: '-64px', dur: '22s', delay: '3.3s' },
];

/* Mirrored roughly rather than exactly — a reflection would read as a pattern. */
const RIGHT: readonly Bubble[] = [
  { x: '58%', y: '5%', size: '96px', tint: 'rgba(255, 255, 255, 0.5)', alpha: 0.09, blur: '12px', dx: '-20px', dy: '-80px', dur: '26s', delay: '1.8s' },
  { x: '14%', y: '20%', size: '140px', tint: 'rgba(255, 255, 255, 0.4)', alpha: 0.07, blur: '15px', dx: '26px', dy: '-104px', dur: '36s', delay: '0s' },
  { x: '64%', y: '38%', size: '60px', tint: 'rgba(240, 180, 41, 0.5)', alpha: 0.12, blur: '8px', dx: '-16px', dy: '-66px', dur: '23s', delay: '3.6s' },
  { x: '28%', y: '55%', size: '112px', tint: 'rgba(150, 205, 255, 0.45)', alpha: 0.08, blur: '13px', dx: '22px', dy: '-92px', dur: '31s', delay: '2.2s' },
  { x: '70%', y: '72%', size: '78px', tint: 'rgba(255, 255, 255, 0.5)', alpha: 0.1, blur: '10px', dx: '-20px', dy: '-76px', dur: '28s', delay: '5s' },
  { x: '20%', y: '88%', size: '130px', tint: 'rgba(255, 170, 180, 0.45)', alpha: 0.06, blur: '15px', dx: '16px', dy: '-100px', dur: '34s', delay: '1.1s' },
];

function Gutter({ side, bubbles }: { side: 'left' | 'right'; bubbles: readonly Bubble[] }) {
  return (
    <div className={`bubbles__gutter bubbles__gutter--${side}`}>
      {bubbles.map((bubble, index) => (
        <span
          key={index}
          className="bubble"
          style={
            {
              '--x': bubble.x,
              '--y': bubble.y,
              '--size': bubble.size,
              '--tint': bubble.tint,
              '--alpha': bubble.alpha,
              '--blur': bubble.blur,
              '--dx': bubble.dx,
              '--dy': bubble.dy,
              '--dur': bubble.dur,
              '--delay': bubble.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function AmbientBubbles() {
  return (
    // Decorative: hidden from assistive tech, and never in the way of a click.
    <div className="bubbles" aria-hidden="true">
      <Gutter side="left" bubbles={LEFT} />
      <Gutter side="right" bubbles={RIGHT} />
    </div>
  );
}
