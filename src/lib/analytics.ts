import 'server-only';
import { serviceClient } from './supabase/admin';

/**
 * First-party product analytics. Kept in our own database: the answer key never
 * goes to a third party, and no event carries which word was fabricated.
 */
export const ANALYTICS_EVENTS = [
  'game_view',
  'game_start',
  'round_selection',
  'game_complete',
  'result_explanation_open',
  'all_definitions_open',
  'share_result',
  'signup_after_result',
  'login',
  'leaderboard_view',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export function isAnalyticsEvent(name: string): name is AnalyticsEventName {
  return (ANALYTICS_EVENTS as readonly string[]).includes(name);
}

const SAFE_KEYS = new Set([
  'roundNumber',
  'gameNumber',
  'displayPosition',
  'elapsedMs',
  'correctCount',
  'source',
  'variant',
  'path',
]);

/** Strip anything that could leak content into the event log. */
export function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!SAFE_KEYS.has(key)) continue;
    if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string') out[key] = value.slice(0, 60);
  }
  return out;
}

export async function logEvent(input: {
  name: string;
  userId?: string | null;
  sessionId?: string | null;
  gameId?: string | null;
  attemptId?: string | null;
  metadata?: unknown;
}): Promise<void> {
  if (!isAnalyticsEvent(input.name)) return;
  try {
    await serviceClient().from('analytics_events').insert({
      name: input.name,
      user_id: input.userId ?? null,
      session_id: input.sessionId ?? null,
      game_id: input.gameId ?? null,
      attempt_id: input.attemptId ?? null,
      metadata: sanitizeMetadata(input.metadata),
    });
  } catch {
    // Analytics must never break gameplay.
  }
}
