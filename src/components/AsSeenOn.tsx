/**
 * "As seen on" press badge, shown under the homepage hero.
 *
 * Deliberately NOT wrapped in a link. The supplied embed code pointed at the
 * badge generator's marketing site with UTM tracking attached; an outbound
 * advert has no business on the front page of the game, so only the image is
 * kept. Nothing here is clickable and there is no watermark.
 *
 * A plain <img> rather than next/image: the badge is rendered on demand by a
 * third party, so there is nothing for the optimiser to do and no remote host
 * to whitelist in next.config.js.
 */
const BADGE_SRC =
  'https://prnow.io/api/badge?template=ribbon&logos=ap%2Cusatoday%2Cabc%2Cnbc%2Cfox' +
  '&ratio=compact&font=sans&header=AS+SEEN+ON&bg=%23ffffff&fg=%23111827' +
  '&accent=%231f2937&border=%231f2937&totalSites=100';

export function AsSeenOn() {
  return (
    <div className="asseenon">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BADGE_SRC}
        alt="As seen on AP, USA Today, ABC, NBC and Fox"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
