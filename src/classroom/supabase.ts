/**
 * The one Supabase client. Imported only by the lazily loaded classroom screens, so learners who never open
 * "Class" download none of this and make no network calls (Wayline stays local-first).
 *
 * The publishable key is public by design: what a signed-in user can do is decided by row-level security
 * in the database (supabase/migrations), not by keeping this key secret.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** False on builds without Supabase settings (e.g. the single-file artifact); the screens then say so. */
export const classroomConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = classroomConfigured
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
