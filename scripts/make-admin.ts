/**
 * Grants admin rights. Creates the account if it does not exist yet.
 *
 *   # If the account already exists:
 *   npm run admin:create -- you@example.com
 *
 *   # Create account + grant admin in one step (bypasses email confirmation):
 *   npm run admin:create -- you@example.com --password yourpassword
 *
 * Admin is deliberately a CLI action: it cannot be granted from the web UI, and
 * the profiles table has a trigger that blocks client-side escalation.
 */
import { config } from 'dotenv';
import { serviceClient, isSupabaseConfigured } from '../src/lib/supabase/admin';

config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((arg) => arg.includes('@'));
  const passwordIndex = args.indexOf('--password');
  const password = passwordIndex !== -1 ? args[passwordIndex + 1] : null;

  if (!email) {
    console.error('Usage: npm run admin:create -- you@example.com [--password yourpassword]');
    process.exit(1);
  }
  if (!isSupabaseConfigured()) {
    console.error('Supabase is not configured. Check .env.local.');
    process.exit(1);
  }

  const db = serviceClient();

  // Find existing auth user by email.
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) userId = match.id;
    if (data.users.length < 200) break;
  }

  // Create the account if it doesn't exist and a password was supplied.
  if (!userId) {
    if (!password) {
      console.error(
        `No account found for ${email}.`,
        '\nTo create it, run:',
        `\n  npm run admin:create -- ${email} --password yourpassword`,
        '\nOr sign in once at /login to create the account, then re-run.',
      );
      process.exit(1);
    }

    console.log(`No account found. Creating ${email}...`);
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip the confirmation email - the account is usable immediately.
    });
    if (createError || !created.user) {
      throw new Error(createError?.message ?? 'Failed to create user.');
    }
    userId = created.user.id;
    console.log(`Account created (id: ${userId}).`);
  } else {
    // Update the password if one was supplied (allows resetting forgotten passwords).
    if (password) {
      const { error: pwError } = await db.auth.admin.updateUserById(userId, { password });
      if (pwError) throw new Error(pwError.message);
      console.log('Password updated.');
    }
  }

  // Grant admin in the profiles table.
  await db.from('profiles').upsert(
    { user_id: userId, is_admin: true },
    { onConflict: 'user_id' },
  );

  const { data: profile } = await db
    .from('profiles')
    .select('display_name, is_admin')
    .eq('user_id', userId)
    .maybeSingle();

  console.log(`\n✓ ${email} is now an admin.`);
  console.log(`  display name: ${(profile as { display_name?: string } | null)?.display_name ?? '(unset)'}`);
  console.log('  Open /admin to manage the game bank.');
  console.log(`  Sign in at /login with email + password mode.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
