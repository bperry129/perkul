/**
 * "As seen on" press badge. It sits *outside* the white card, on the green,
 * directly beneath it — press credentials belong next to the product, not inside
 * the game surface. Rendered by `src/app/page.tsx` after the `.shell--narrow`
 * card, and hidden while the clock is running (`body[data-playing]`).
 *
 * The file is served from `public/as-seen-on.svg`, not hot-linked from the badge
 * generator. Two reasons, one of them forced:
 *
 *  - It has to be transparent so the green shows through, and the generator
 *    ignores its own `bg` parameter — every value returns byte-identical markup
 *    with a white slab baked in. Owning the file is the only way to delete it.
 *  - The generator also 403s anything that does not look like a browser, so it
 *    was never a dependency worth having on the homepage's critical path.
 *
 * Re-fetch it with `npm run badge:vendor` (see scripts/vendor-badge.mjs).
 *
 * Deliberately NOT wrapped in a link. The supplied embed code pointed at the
 * badge generator's marketing site with UTM tracking attached; an outbound
 * advert has no business on the front page of the game. Nothing here is
 * clickable and there is no watermark.
 *
 * A plain <img> rather than next/image: it is a local SVG, so there is nothing
 * for the optimiser to do.
 */
export function AsSeenOn() {
  return (
    <div className="asseenon">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/as-seen-on.svg"
        alt="As seen on AP, USA Today, ABC, NBC and Fox"
        width={1100}
        height={200}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
