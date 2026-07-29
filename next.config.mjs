/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Gameplay payloads are tiny; keep server actions lean.
    serverActions: { bodySizeLimit: '4mb' },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Two years, include subdomains. Vercel adds this automatically for
          // custom domains, but being explicit means local / preview deployments
          // also declare the intent.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Belt-and-suspenders for older browsers that don't support a full CSP.
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
      {
        // Never let a puzzle payload sit in a shared cache.
        source: '/api/(.*)',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
      {
        // The standings are rendered per request and must never be replayed
        // from a cache. The RSC payload Next.js fetches for a client-side
        // <Link> navigation (`/leaderboard?_rsc=...`) is an ordinary cacheable
        // GET, so without this the browser can serve a board captured by an
        // older deployment on the first navigation while a refresh shows the
        // current one.
        source: '/leaderboard',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
