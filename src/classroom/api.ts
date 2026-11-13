/**
 * Every classroom action, one function each, so screens never build queries themselves.
 * Each function throws the Supabase error unchanged; screens turn it into a message with errorKey().
 * What each call may touch is decided by the database's row-level security, not by this file.
 */
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Role = "admin" | "teacher" | "student";
export type Profile = { id: string; role: Role; display_name: string; created_at: string };
export type Membership = { class_id: string; consent_at: string; className: string };
export type ClassStudent = { student_id: string; display_name: string; joined_at: string };
export type TeacherClass = { id: string; name: string; join_code: string; created_at: string; students: ClassStudent[] };

function client() {
  if (!supabase) throw new Error("classroom not configured");
  return supabase;
}

/** Every call below follows one pattern: if Supabase returned an error, throw it; otherwise use the data. */
function throwIf(error: unknown): void {
  if (error) throw error;
}

// ---------- session ----------

export async function currentSession(): Promise<Session | null> {
  const { data, error } = await client().auth.getSession();
  throwIf(error);
  return data.session;
}

export function onSessionChange(callback: (session: Session | null) => void): () => void {
  const { data } = client().auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

/** Returns true when the project requires email confirmation before the first sign-in. */
export async function signUp(displayName: string, email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await client().auth.signUp({ email: email.trim(), password, options: { data: { display_name: displayName.trim() } } });
  throwIf(error);
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({ email: email.trim(), password });
  throwIf(error);
}

export async function signOut(): Promise<void> {
  const { error } = await client().auth.signOut();
  throwIf(error);
}

// ---------- everyone ----------

export async function myProfile(userId: string): Promise<Profile> {
  const { data, error } = await client().from("profiles").select("id, role, display_name, created_at").eq("id", userId).single();
  throwIf(error);
  return data as Profile;
}

// ---------- students ----------

export async function myMembership(userId: string): Promise<Membership | null> {
  const { data, error } = await client().from("class_members").select("class_id, consent_at, classes(name)").eq("student_id", userId).maybeSingle();
  throwIf(error);
  // A membership points at one class, so PostgREST embeds an object (supabase-js can't know that without generated types).
  const row = data as unknown as { class_id: string; consent_at: string; classes: { name: string } | null } | null;
  return row ? { class_id: row.class_id, consent_at: row.consent_at, className: row.classes?.name ?? "" } : null;
}

/** Called only after the consent box is ticked: the database records this moment as consent_at. */
export async function joinClass(code: string): Promise<{ classId: string; className: string }> {
  const { data, error } = await client().rpc("join_class", { code });
  throwIf(error);
  const rows = data as { class_id: string; class_name: string }[];
  return { classId: rows[0].class_id, className: rows[0].class_name };
}

export async function leaveClass(userId: string): Promise<void> {
  const { error } = await client().from("class_members").delete().eq("student_id", userId);
  throwIf(error);
}

// ---------- teachers ----------

export async function teacherClasses(teacherId: string): Promise<TeacherClass[]> {
  const { data, error } = await client()
    .from("classes")
    .select("id, name, join_code, created_at, class_members(student_id, joined_at, profiles(display_name))")
    .eq("teacher_id", teacherId)
    .order("created_at");
  throwIf(error);
  const rows = data as unknown as {
    id: string; name: string; join_code: string; created_at: string;
    class_members: { student_id: string; joined_at: string; profiles: { display_name: string } | null }[];
  }[];
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    join_code: c.join_code,
    created_at: c.created_at,
    students: c.class_members
      .map((m) => ({ student_id: m.student_id, joined_at: m.joined_at, display_name: m.profiles?.display_name ?? "?" }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "bg")),
  }));
}

/** The database fills in the teacher (the caller) and generates the join code. */
export async function createClass(name: string): Promise<void> {
  const { error } = await client().from("classes").insert({ name: name.trim() });
  throwIf(error);
}

export async function removeStudent(studentId: string): Promise<void> {
  const { error } = await client().from("class_members").delete().eq("student_id", studentId);
  throwIf(error);
}

// ---------- admins ----------

export async function allProfiles(): Promise<Profile[]> {
  const { data, error } = await client().from("profiles").select("id, role, display_name, created_at").order("created_at", { ascending: false });
  throwIf(error);
  return data as Profile[];
}

export async function setRole(target: string, role: Role): Promise<void> {
  const { error } = await client().rpc("set_role", { target, new_role: role });
  throwIf(error);
}
