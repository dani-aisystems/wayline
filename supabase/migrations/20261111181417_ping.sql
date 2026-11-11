-- Health probe and keep-alive.
--
-- /api/health calls this once per request, and a Vercel Cron calls /api/health once a day.
-- Supabase pauses free projects that get too little *database* activity in a week, so the probe
-- must run a real query (an auth or HTTP-only ping would not count). `select now()` is the
-- cheapest real query: it touches no table and returns no user data.

create or replace function public.ping()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

comment on function public.ping() is 'Health probe for /api/health: proves the database answers. Returns the server time only.';

-- Callable by anyone with the publishable key (the health check is public); nothing else is granted.
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
