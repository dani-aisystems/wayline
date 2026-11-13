/**
 * Test harness for the database rules. Talks to a real Supabase over its public API, the same path the
 * browser uses, so these tests prove what a signed-in teacher or student can actually do.
 *
 * Needs three variables (CI sets them from `supabase start`; locally use a dev project, never production):
 *   SUPABASE_TEST_URL, SUPABASE_TEST_PUBLISHABLE_KEY, SUPABASE_TEST_SECRET_KEY
 * The secret key is used only to create and delete the test users, never in the checks themselves.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL;
const publishable = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_TEST_SECRET_KEY;

export const dbConfigured = Boolean(url && publishable && secret);
export const NOT_CONFIGURED = "set SUPABASE_TEST_URL, SUPABASE_TEST_PUBLISHABLE_KEY and SUPABASE_TEST_SECRET_KEY to run database tests";

const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** Bypasses RLS: for setup and cleanup only. */
export const admin = (): SupabaseClient => createClient(url!, secret!, options);
/** A client with no session, like a visitor who isn't signed in. */
export const anonymous = (): SupabaseClient => createClient(url!, publishable!, options);

export type Role = "admin" | "teacher" | "student";
export type TestUser = { id: string; email: string; role: Role; client: SupabaseClient };

/** One id per test run, so parallel or interrupted runs never collide. */
const run = Math.random().toString(36).slice(2, 8);
const PASSWORD = "Wayline-test-password-1";

/**
 * Create a confirmed user, give them a role (as setup would: only an admin can do this in the app),
 * and sign them in through the public API.
 */
export async function createUser(name: string, role: Role): Promise<TestUser> {
  const email = `rls-${run}-${name}@example.test`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error || !data.user) throw new Error(`createUser ${name}: ${error?.message}`);
  if (role !== "student") {
    const { error: roleError } = await admin().from("profiles").update({ role }).eq("id", data.user.id);
    if (roleError) throw new Error(`set role ${name}: ${roleError.message}`);
  }
  const client = createClient(url!, publishable!, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`sign in ${name}: ${signInError.message}`);
  return { id: data.user.id, email, role, client };
}

/** Delete test users; their profiles, classes and memberships go with them (on delete cascade). */
export async function deleteUsers(users: TestUser[]): Promise<void> {
  for (const u of users) await admin().auth.admin.deleteUser(u.id);
}
