import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';
import { listArchiveGames } from '@/lib/games';

/**
 * XML sitemap served at /sitemap.xml and linked from robots.txt.
 * Listed in priority order — homepage and leaderboard update daily,
 * evergreen pages update monthly.
 *
 * Every archive puzzle gets its own entry: they are real, permanent,
 * individually playable pages, and they are the only part of the site that
 * grows every day. The lookup is wrapped in a try/catch because a sitemap that
 * throws takes the whole build down with it, and the database is not worth that
 * risk for a file Google re-reads tomorrow anyway.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${BRAND.domain}`;
  const now = new Date().toISOString();

  const core: MetadataRoute.Sitemap = [
    {
      url: base,
      changeFrequency: 'daily',
      priority: 1,
      lastModified: now,
    },
    {
      url: `${base}/leaderboard`,
      changeFrequency: 'daily',
      priority: 0.9,
      lastModified: now,
    },
    {
      url: `${base}/archive`,
      changeFrequency: 'daily',
      priority: 0.9,
      lastModified: now,
    },
    {
      url: `${base}/how-to-play`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${base}/word-policy`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${base}/for-publishers`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];


  try {
    const games = await listArchiveGames();
    return [
      ...core,
      ...games.map((game) => ({
        url: `${base}/archive/${game.activeDate}`,
        changeFrequency: 'yearly' as const,
        priority: 0.5,
      })),
    ];
  } catch {
    return core;
  }
}
