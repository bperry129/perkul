/**
 * Vendors the "as seen on" press badge into public/as-seen-on.svg.
 *
 * Why vendor it at all:
 *  - The badge must be transparent so the green shows through, and the API
 *    ignores its own `bg` parameter — the response is byte-identical whatever
 *    you pass, with the white background baked into the markup. The only way to
 *    remove it is to own the file.
 *  - It also removes a third-party request from the homepage's critical path,
 *    and the generator 403s anything that does not look like a browser, so
 *    hot-linking it was never something to rely on.
 *
 * The five logos are RGBA PNGs embedded as data URIs, so they already have
 * transparent backgrounds and drop onto the green cleanly. Nothing here is
 * redrawn: we delete the background, and lift one low-contrast grey that was
 * chosen for white.
 *
 * Run:  npm run badge:vendor
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE =
  'https://prnow.io/api/badge?template=ribbon&logos=ap%2Cusatoday%2Cabc%2Cnbc%2Cfox' +
  '&ratio=compact&font=sans&header=AS+SEEN+ON&bg=%23ffffff&fg=%23111827' +
  '&accent=%231f2937&border=%231f2937&totalSites=100';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'as-seen-on.svg');

/** The subtitle grey is fine on white and muddy on green. */
const SUBTITLE_GREY = '#6b7280';
const INK = '#21332c';

const response = await fetch(SOURCE, {
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/126.0 Safari/537.36',
  },
});

if (!response.ok) {
  console.error(`Badge fetch failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const original = await response.text();
let svg = original;

// 1. The full-canvas white background.
svg = svg.replace(/\s*<rect x="0" y="0" width="\d+" height="\d+" fill="#ffffff"\s*\/>/, '');

// 2. The white fills that remain are the ribbon panel and its two folded ends.
//    Keep every stroke: the dark outline is the badge's shape.
svg = svg.replace(/fill="#ffffff"/g, 'fill="none"');

// 3. Lift the subtitle to the site's ink so it stays readable on the green.
svg = svg.replaceAll(SUBTITLE_GREY, INK);

const removedBackground = !svg.includes('<rect x="0" y="0"');
const whiteLeft = (svg.match(/#ffffff/g) ?? []).length;

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, svg, 'utf8');

console.log(`Wrote ${OUT}`);
console.log(`  source bytes      ${original.length}`);
console.log(`  written bytes     ${svg.length}`);
console.log(`  background gone   ${removedBackground}`);
console.log(`  #ffffff remaining ${whiteLeft}`);

if (!removedBackground || whiteLeft > 0) {
  console.error('\nThe badge markup changed shape upstream — check the output before shipping.');
  process.exit(1);
}
