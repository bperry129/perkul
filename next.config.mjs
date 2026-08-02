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
        /**
         * Everything except the embed. `X-Frame-Options: SAMEORIGIN` is the
         * right answer for the whole site and the wrong answer for a widget:
         * it refuses all third-party framing and, because `ALLOW-FROM` is dead
         * in every modern browser, it cannot express an allowlist at all.
         *
         * So `/embed/*` is excluded here and defends itself with a
         * `Content-Security-Policy: frame-ancestors` computed per publisher at
         * request time (see src/app/embed/layout.tsx). That is strictly
         * stronger than XFO — it names the exact origins allowed to frame a
         * given key, and the browser enforces it.
         *
         * Negative lookahead rather than two positive rules: a publisher who
         * embeds must not be able to reach any other path of ours in a frame.
         */
        source: '/((?!embed).*)',
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
