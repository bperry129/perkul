import 'server-only';
import { cache } from 'react';
import { lookupPublisher } from './publishers';

/**
 * Request-deduped publisher lookup for Server Components and Route Handlers.
 *
 * Deliberately kept out of `./publishers.ts` — that module is imported by
 * `middleware.ts`, which runs on the Edge runtime outside of any React
 * render. React's `cache()` throws at module-evaluation time in that
 * context, which takes down every request the middleware touches (not just
 * `/embed/*`). Import `findPublisher` from here in pages/route handlers, and
 * `lookupPublisher` directly from `./publishers` in middleware.
 */
export const findPublisher = cache(lookupPublisher);
