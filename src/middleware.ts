import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { lookupPublisher, frameAncestors } from '@/lib/publishers';

/**
 * Refreshes the Supabase auth session cookie. Server components cannot write
 * cookies during render, so the refresh happens here.
 *
 * Also the only place that can set a *response header* ahead of an
 * `/embed/*` render — a layout cannot set response headers, only request
 * headers get to it — so this is where the per-publisher
 * `Content-Security-Policy: frame-ancestors` is computed. `next.config.mjs`
 * already excludes `/embed/*` from the blanket `X-Frame-Options: SAMEORIGIN`;
 * this is what actually authorises the specific origins allowed to frame a
 * given key, and it fails closed — an unknown, suspended, or keyless request
 * is refused framing entirely rather than defaulting to open.
 */

export async function middleware(request: NextRequest) {
  const isEmbed = request.nextUrl.pathname.startsWith('/embed');

  // `x-embed` rides on the *request* headers, not the response — this is what
  // lets the root layout (a Server Component, rendered from this same
  // request) skip SiteHeader/SiteFooter/AmbientBubbles/StatCounter for
  // `/embed/*` without duplicating the whole app into a second route-group
  // root layout. Next.js requires every top-level segment to join a group
  // once you do that, which would touch every existing route just to remove
  // header/footer from one of them.
  const requestHeaders = new Headers(request.headers);
  if (isEmbed) requestHeaders.set('x-embed', '1');

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (isEmbed) {
    const key = request.nextUrl.searchParams.get('k');
    // Uncached on purpose — see the comment on lookupPublisher(). A cached
    // read here would risk a suspended publisher's stale "active" row
    // outliving the DB change for as long as this Edge Function instance does.
    const publisher = await lookupPublisher(key);
    response.headers.set('Content-Security-Policy', frameAncestors(publisher));
  }


  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options, maxAge: 0 });
        },
      },
    },
  );

  try {
    await supabase.auth.getUser();
  } catch {
    /* an expired session simply means "play as a guest" */
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico)$).*)'],
};
