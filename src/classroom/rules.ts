/**
 * Small, pure rules for the classroom layer. No Supabase import here, so these are cheap to test and
 * cost nothing in the main bundle. The database enforces the same limits; these give instant feedback.
 */
import type { ClassKey } from "../i18n/classroom-strings";

/** Same alphabet as private.new_join_code(): no 0/O or 1/I. Mirrors the CHECK on classes.join_code. */
export const JOIN_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

/** What people type: " k7m2qx ", "K7M-2QX". Returns the code as stored, or null if it can't be one. */
export function normalizeJoinCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return JOIN_CODE.test(code) ? code : null;
}

/** Display names: 1–40 characters after trimming (profiles.display_name CHECK). */
export const validDisplayName = (name: string) => name.trim().length >= 1 && name.trim().length <= 40;
/** Class names: 1–60 characters after trimming (classes.name CHECK). */
export const validClassName = (name: string) => name.trim().length >= 1 && name.trim().length <= 60;
/** Our own minimum; Supabase's default is lower. */
export const MIN_PASSWORD = 8;

type AnyError = { code?: string; message?: string; status?: number; name?: string } | null | undefined;

/**
 * Turn any error from Supabase Auth, the database or the network into a message key the learner can act on.
 * Database errors carry the fixed codes our SQL functions raise (see *_classroom_core.sql).
 */
export function errorKey(error: AnyError): ClassKey {
  if (!error) return "class.err.generic";
  const { code, status, name = "", message = "" } = error;
  if (name === "AuthRetryableFetchError" || /failed to fetch|networkerror|load failed|fetch failed/i.test(message)) return "class.err.network";
  if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "class.err.rateLimited";
  switch (code) {
    case "invalid_credentials":
      return "class.err.credentials";
    case "user_already_exists":
    case "email_exists":
      return "class.err.exists";
    case "weak_password":
      return "class.err.weakPassword";
    case "email_not_confirmed":
      return "class.err.notConfirmed";
    case "P0002":
      return "class.err.noClass";
    case "42501":
      return "class.err.denied";
    default:
      return "class.err.generic";
  }
}
