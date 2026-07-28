/**
 * Grants admin rights.
 *
 *   npm run admin:create -- you@example.com
 *
 * The account must already exist (sign in once with a magic link first). Admin
 * is deliberately a CLI action: it cannot be granted from the web UI, and the
 * profiles table has a trigger that blocks client-side escalation.
 */
import { config } from 'dotenv';
import { serviceClient, isSupabaseConfigured } from '../src/lib/supabase/admin';

config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  const email = process.argv.slice(2).find((arg) => arg.includes('@'));
  if (!email) {
    console.error('Usage: npm run admin:create -- you@example.com');
    process.exit(1);
  }
  if (!isSupabaseConfigured()) {
    console.error('Supabase is not configured. Check .env.local.');
    process.exit(1);
  }

  const db = serviceClient();

  // Find the auth user by email.
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) userId = match.id;
    if (data.users.length < 200) break;
  }

  if (!userId) {
    console.error(
      `No account found for ${email}. Sign in once at /login to create the account, then re-run this.`,
    );
    process.exit(1);
  }

  await db.from('profiles').upsert(
    { user_id: userId, is_admin: true },
    { onConflict: 'user_id' },
  );

  const { data: profile } = await db
    .from('profiles')
    .select('display_name, is_admin')
    .eq('user_id', userId)
    .maybeSingle();

  console.log(`${email} is now an admin.`);
  console.log(`display name: ${(profile as { display_name?: string } | null)?.display_name ?? '(unset)'}`);
  console.log('Open /admin to manage the game bank.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
