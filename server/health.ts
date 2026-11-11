/**
 * GET /api/health — is the server up, and does the database answer?
 *
 * Used three ways: by the uptime check on the live URL, by the daily Vercel Cron that keeps the free
 * Supabase project from pausing, and by the jury if they want to see the backend respond.
 * It returns no user data, so it needs no authentication.
 *
 * `fetchImpl` and `now` are parameters so tests can run it without a network or a real clock.
 */

export type HealthEnv = { supabaseUrl?: string; publishableKey?: string };

export type HealthBody = {
  ok: boolean;
  /** "unconfigured" = no Supabase settings in this environment (e.g. a fresh preview deploy). */
  db: "up" | "down" | "unconfigured";
  time: string;
};

/** Give up on the database after this long, so a hung connection can't hang the check. */
export const DB_TIMEOUT_MS = 5000;

export async function checkHealth(env: HealthEnv, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<Response> {
  const time = now().toISOString();
  if (!env.supabaseUrl || !env.publishableKey) return reply({ ok: true, db: "unconfigured", time });

  try {
    // public.ping() runs `select now()` (supabase/migrations/*_ping.sql): a real query, so it counts as database activity.
    const res = await fetchImpl(`${env.supabaseUrl}/rest/v1/rpc/ping`, {
      method: "POST",
      headers: { apikey: env.publishableKey, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(DB_TIMEOUT_MS),
    });
    return res.ok ? reply({ ok: true, db: "up", time }) : reply({ ok: false, db: "down", time }, 503);
  } catch {
    // Network error or timeout: report it, never throw (a thrown error would become an opaque 500).
    return reply({ ok: false, db: "down", time }, 503);
  }
}

function reply(body: HealthBody, status = 200): Response {
  // no-store: a cached "up" would hide an outage from the uptime check.
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
