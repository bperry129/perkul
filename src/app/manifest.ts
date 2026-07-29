import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

/**
 * Served at /manifest.webmanifest. Next links it automatically.
 *
 * The 192/512 PNGs are flattened onto the brand green rather than keeping the
 * rounded corners of the source mark: Android and iOS apply their own mask, and
 * transparent corners read as notches once they do.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} - ${BRAND.tagline}`,
    short_name: BRAND.name,
    description: BRAND.subline,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#4db588',
    theme_color: '#4db588',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
