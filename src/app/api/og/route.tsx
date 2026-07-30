import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

/**
 * Dynamic share-preview image for challenge links (/?c=<attemptId>).
 *
 * The static /opengraph-image used by every other page can't reflect a
 * particular attempt's score — it has no idea which challenge link a browser
 * is about to unfurl. This route reads the score/correct/elapsed straight
 * from the query string (all public leaderboard-equivalent numbers, nothing
 * from the answer key) and renders a one-off image, so a link pasted into
 * iMessage/SMS/WhatsApp/etc. previews the actual challenge instead of the
 * generic homepage card.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('name') || 'A friend').slice(0, 40);
  const score = Math.max(0, Number(searchParams.get('score') ?? 0)) || 0;
  const correct = Math.max(0, Math.min(10, Number(searchParams.get('correct') ?? 0))) || 0;
  const total = Math.max(1, Number(searchParams.get('total') ?? 10)) || 10;
  const elapsedMs = Math.max(0, Number(searchParams.get('elapsed') ?? 0)) || 0;
  const elapsedLabel = (elapsedMs / 1000).toFixed(2);

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
          padding: '80px 90px',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: 44,
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: '2px',
            marginBottom: 28,
          }}
        >
          PERKUL
        </div>

        <div
          style={{
            fontWeight: 800,
            fontSize: 58,
            color: '#fff',
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            marginBottom: 28,
            maxWidth: 980,
          }}
        >
          {name} scored {score.toLocaleString()} points
        </div>

        <div
          style={{
            display: 'flex',
            gap: 18,
            marginBottom: 44,
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.16)',
              border: '2.5px solid rgba(255,255,255,0.35)',
              borderRadius: 16,
              padding: '18px 32px',
              fontWeight: 700,
              fontSize: 34,
              color: '#fff',
              display: 'flex',
            }}
          >
            {correct}/{total} correct
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,0.16)',
              border: '2.5px solid rgba(255,255,255,0.35)',
              borderRadius: 16,
              padding: '18px 32px',
              fontWeight: 700,
              fontSize: 34,
              color: '#fff',
              display: 'flex',
            }}
          >
            {elapsedLabel}s
          </div>
        </div>

        <div
          style={{
            fontWeight: 600,
            fontSize: 30,
            color: 'rgba(255,255,255,0.82)',
          }}
        >
          Think you can beat them? Play today&apos;s Perkul.
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
