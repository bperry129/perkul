import { ImageResponse } from 'next/og';

// Served at /opengraph-image and automatically wired as og:image / twitter:image
// on every page in the app by Next.js.
export const runtime = 'edge';
export const alt = "Perkul — One of these words isn't real.";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const words = [
    { label: 'loquent',  fake: false },
    { label: 'gallant',  fake: false },
    { label: 'plaudit',  fake: false },
    { label: 'verbose',  fake: false },
    { label: 'verisol',  fake: true  },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          background: '#4db588',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px 88px',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            fontWeight: 900,
            fontSize: 100,
            color: '#fff',
            letterSpacing: '-3px',
            marginBottom: 16,
            lineHeight: 1,
          }}
        >
          Perkul
        </div>

        {/* Tagline */}
        <div
          style={{
            fontWeight: 700,
            fontSize: 44,
            color: 'rgba(255,255,255,0.88)',
            letterSpacing: '-1px',
            marginBottom: 52,
            lineHeight: 1.2,
          }}
        >
          One of these words isn&apos;t real.
        </div>

        {/* Word tiles — five options, one fake */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 52 }}>
          {words.map((w) => (
            <div
              key={w.label}
              style={{
                background: w.fake ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.22)',
                border: w.fake
                  ? '2.5px dashed rgba(255,255,255,0.55)'
                  : '2.5px solid rgba(255,255,255,0.38)',
                borderRadius: 14,
                padding: '16px 26px',
                fontWeight: 700,
                fontSize: 30,
                color: w.fake ? 'rgba(255,255,255,0.70)' : '#fff',
                letterSpacing: '0.01em',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {w.label}
            </div>
          ))}
        </div>

        {/* Sub-rule */}
        <div
          style={{
            fontWeight: 500,
            fontSize: 26,
            color: 'rgba(255,255,255,0.68)',
            letterSpacing: '0.02em',
          }}
        >
          10 rounds · 5 words each · new puzzle every day · perkul.com
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
