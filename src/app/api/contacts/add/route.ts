import { fail, json, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Adds a signup to the Resend "All Contacts" audience.
 *
 * Supabase Auth uses Resend only as an SMTP relay for the "confirm your
 * email" mail — that never touches Resend's Contacts API, which is why
 * signups show up under Resend's "Emails" tab but never in Audience/Contacts.
 * This route is the missing link: called once at signup time (see
 * LoginForm.tsx), it adds the address as a contact so it's reachable from a
 * Resend broadcast later.
 *
 * Deliberately never fails the signup: RESEND_API_KEY/RESEND_AUDIENCE_ID
 * missing, or Resend being briefly down, degrades to a no-op with a server
 * log, not a broken signup flow.
 */
export async function POST(request: Request) {
  const body = await readJson<{ email?: string; displayName?: string }>(request);
  const email = body?.email?.trim().toLowerCase();
  if (!email) return fail('Email required.', 'bad_request', 400);

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey || !audienceId) {
    console.error('[perkul] RESEND_API_KEY/RESEND_AUDIENCE_ID not configured — skipping contact add');
    return json({ ok: true, skipped: true });
  }

  const [firstName, ...rest] = (body?.displayName ?? '').trim().split(/\s+/).filter(Boolean);

  try {
    const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        first_name: firstName || undefined,
        last_name: rest.length ? rest.join(' ') : undefined,
        unsubscribed: false,
      }),
    });

    // Resend treats re-adding an existing contact as a success (it upserts);
    // anything else is logged but still doesn't fail the caller's signup.
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[perkul] Resend contact add failed: ${res.status} ${detail}`);
    }
  } catch (err) {
    console.error('[perkul] Resend contact add error:', err instanceof Error ? err.message : err);
  }

  return json({ ok: true });
}
