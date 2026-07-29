import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND } from '../src/lib/brand';

/**
 * Terms and Privacy both promise a reply at the contact address, and the footer
 * publishes it. That is three places for the same fact, which is how a live
 * legal page ends up naming a mailbox nobody reads. So: one constant, and a test
 * that fails the moment a literal address is pasted back into a page.
 */

const SRC = join(__dirname, '..', 'src');

/** Placeholders in form fields and CLI examples are documentation, not contacts. */
const ALLOWED = [/you@example\.com/g, /email@example\.com/g, /admin@example\.com/g];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

describe('contact address', () => {
  it('is a real address on the perkul domain', () => {
    expect(BRAND.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    expect(BRAND.email.endsWith('perkul.com')).toBe(true);
  });

  it('is never hard-coded in a page or component', () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      // brand.ts is where the address is allowed to be a literal.
      if (file.endsWith(join('lib', 'brand.ts'))) continue;

      let contents = readFileSync(file, 'utf8');
      for (const placeholder of ALLOWED) contents = contents.replace(placeholder, '');

      const found = contents.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (found) offenders.push(`${file}: ${found.join(', ')}`);
    }

    expect(offenders).toEqual([]);
  });

  it('is published in the footer', () => {
    const footer = readFileSync(join(SRC, 'components', 'SiteFooter.tsx'), 'utf8');
    expect(footer).toContain('mailto:${BRAND.email}');
  });

  it('is the address the legal pages point at', () => {
    for (const page of ['terms', 'privacy']) {
      const contents = readFileSync(join(SRC, 'app', page, 'page.tsx'), 'utf8');
      expect(contents, page).toContain('mailto:${BRAND.email}');
    }
  });
});
