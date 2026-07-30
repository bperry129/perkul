import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

/**
 * Disallow crawlers from hitting admin, API, and auth routes.
 * These are protected server-side regardless, but keeping them out
 * of search indexes avoids unnecessary probing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/auth/'],
      },
    ],
    host: `https://${BRAND.domain}`,
    sitemap: `https://${BRAND.domain}/sitemap.xml`,
  };
}
