import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

/**
 * XML sitemap served at /sitemap.xml and linked from robots.txt.
 * Listed in priority order — homepage and leaderboard update daily,
 * evergreen pages update monthly.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${BRAND.domain}`;
  const now = new Date().toISOString();
  return [
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
      url: `${base}/how-to-play`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${base}/word-policy`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
