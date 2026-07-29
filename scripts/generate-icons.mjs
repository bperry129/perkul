/**
 * Generates the Perkul icon set from the single source of truth,
 * design/favicon/03-gap.svg ("The Gap").
 *
 * Run with:  node scripts/generate-icons.mjs   (requires sharp, dev-only)
 *
 * Outputs are committed, so sharp is NOT a project dependency - install it
 * temporarily if the mark ever changes, regenerate, then remove it again.
 *
 *   src/app/icon.svg        crisp vector favicon for modern browsers
 *   src/app/favicon.ico     16/32/48 raster fallback
 *   src/app/apple-icon.png  180px, iOS home screen
 *   public/icon-192.png     PWA
 *   public/icon-512.png     PWA
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const BRAND_GREEN = '#4db588';
const svg = readFileSync('design/favicon/03-gap.svg');
mkdirSync('public', { recursive: true });

/** Rasterise at a high density so the arc stays clean, then downscale. */
const raster = (size) => sharp(svg, { density: 600 }).resize(size, size);

/** Rounded corners intact - the browser draws these on its own background. */
const rounded = (size) => raster(size).png({ compressionLevel: 9 }).toBuffer();

/** Square, full-bleed: iOS and Android apply their own mask, so transparent
 *  corners would show up as notches. Flatten onto the brand green instead. */
const flat = (size) =>
  raster(size).flatten({ background: BRAND_GREEN }).png({ compressionLevel: 9 }).toBuffer();

writeFileSync('src/app/icon.svg', svg);
writeFileSync('src/app/apple-icon.png', await flat(180));
writeFileSync('public/icon-192.png', await flat(192));
writeFileSync('public/icon-512.png', await flat(512));

/* ---- favicon.ico: an ICO container wrapping three PNGs ------------------ */
const sizes = [16, 32, 48];
const images = [];
for (const size of sizes) images.push(await rounded(size));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);

let offset = 6 + 16 * sizes.length;
const directory = sizes.map((size, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0); // width
  entry.writeUInt8(size, 1); // height
  entry.writeUInt8(0, 2); // palette size
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(images[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return entry;
});

writeFileSync('src/app/favicon.ico', Buffer.concat([header, ...directory, ...images]));

console.log('Icons generated:');
console.log('  src/app/icon.svg, favicon.ico (16/32/48), apple-icon.png (180)');
console.log('  public/icon-192.png, public/icon-512.png');
