-- Wayline Клас, block 2: who is who, and which class they belong to.
--
-- Three tables (profiles, classes, class_members), row-level security (RLS) on every one, and two functions
-- that are the only way to do the privileged things: join a class by code, and change someone's role.
-- Rule of thumb: the browser can do only what a policy or a column grant below allows. Everything else is refused.

-- =====================================================================================================
-- Helpers live in a schema the API does not expose (only "public" is), so nobody can call them over HTTP.
-- =====================================================================================================
create schema if not exists private;

-- A 6-character class code. No 0/O or 1/I, so it can be read aloud and typed without mistakes.
-- The bytes come from gen_random_uuid() (a cryptographic source), not random(), so codes can't be predicted.
-- 32 symbols and 256 % 32 = 0, so every symbol is equally likely: 32^6 ≈ 1.07 billion codes.
create function private.new_join_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(r.b, i) % 32 + 1, 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) as b) r, generate_series(0, 5) as i;  -- bytes 0-5 are fully random in a v4 uuid
$$;

-- =====================================================================================================
-- profiles: one row per account. Created by a trigger at sign-up, never by the browser.
-- =====================================================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'student' check (role in ('admin', 'teacher', 'student')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per account: role and the name a teacher sees. No email, no age, no school.';

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The role is always the column default ('student'). Whatever the sign-up form sends can never make
  -- someone a teacher or an admin; only public.set_role() can, and only for an admin.
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 40)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- =====================================================================================================
-- classes: created by a teacher. The join code is chosen by the database, never by the browser.
-- =====================================================================================================
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  join_code text not null unique default private.new_join_code() check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  -- Milestone B: the skill the teacher wants the class to practise more.
  focus_skill text check (focus_skill in ('vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing')),
  focus_set_at timestamptz,
  created_at timestamptz not null default now()
);
create index classes_teacher_id_idx on public.classes (teacher_id);

-- =====================================================================================================
-- class_members: a student belongs to at most one class (the primary key is the student).
-- consent_at records when the student agreed, on the consent screen, to share their progress.
-- =====================================================================================================
create table public.class_members (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  consent_at timestamptz not null,
  joined_at timestamptz not null default now()
);
create index class_members_class_id_idx on public.class_members (class_id);

-- =====================================================================================================
-- Questions the policies ask. SECURITY DEFINER: they read the tables as their owner, bypassing RLS, so a
-- policy on classes can look at class_members (and the other way round) without the policies calling each other
-- in a loop. Each answers only about the signed-in user (auth.uid()), so they reveal nothing else.
-- =====================================================================================================
create function private.my_role()
returns text
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = (select auth.uid()) $$;

create function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select private.my_role()) = 'admin', false) $$;

-- Does the signed-in user teach this class?
create function private.teaches_class(which_class uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.classes where id = which_class and teacher_id = (select auth.uid())) $$;

-- Is this student in one of the signed-in teacher's classes?
create function private.teaches_student(which_student uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.class_members m join public.classes c on c.id = m.class_id
    where m.student_id = which_student and c.teacher_id = (select auth.uid())
  )
$$;

-- The signed-in student's class, if any.
create function private.my_class_id()
returns uuid
language sql stable security definer set search_path = ''
as $$ select class_id from public.class_members where student_id = (select auth.uid()) $$;

-- =====================================================================================================
-- Privileges. Supabase grants everything on new public tables to the API roles by default; take it all
-- back, then give exactly what each screen needs. Column lists matter: e.g. a user may update their
-- display_name but not their role, and a teacher may rename a class but not change its code.
-- =====================================================================================================
revoke all on public.profiles, public.classes, public.class_members from anon, authenticated;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;
revoke execute on function private.handle_new_user() from authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select, delete on public.classes to authenticated;
grant insert (name) on public.classes to authenticated;  -- teacher_id and join_code come from their defaults
grant update (name, focus_skill, focus_set_at) on public.classes to authenticated;

grant select, delete on public.class_members to authenticated;  -- joining goes through join_class() only

-- =====================================================================================================
-- Row-level security: which rows each person may see or change.
-- (select ...) around the helpers lets Postgres evaluate them once per query instead of once per row.
-- =====================================================================================================
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;

-- profiles
create policy "see yourself, your students, or everyone if admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()) or private.teaches_student(id));

create policy "change your own display name" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- classes
create policy "see your own classes, the class you are in, or all if admin" on public.classes
  for select to authenticated
  using (teacher_id = (select auth.uid()) or id = (select private.my_class_id()) or (select private.is_admin()));

create policy "teachers create classes for themselves" on public.classes
  for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select private.my_role()) = 'teacher');

create policy "teachers edit their own classes" on public.classes
  for update to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));

create policy "teachers delete their own classes, admins any" on public.classes
  for delete to authenticated
  using (teacher_id = (select auth.uid()) or (select private.is_admin()));

-- class_members
create policy "see your own membership, your class lists, or all if admin" on public.class_members
  for select to authenticated
  using (student_id = (select auth.uid()) or private.teaches_class(class_id) or (select private.is_admin()));

create policy "leave a class, remove a student from your class, or admin" on public.class_members
  for delete to authenticated
  using (student_id = (select auth.uid()) or private.teaches_class(class_id) or (select private.is_admin()));

-- =====================================================================================================
-- join_class(code): the only way into a class. Called by the consent screen after the student agrees,
-- so the membership row records that moment. Joining another class moves the student (one class each).
-- Errors carry fixed codes the app translates: 28000 not signed in, 42501 not a student, P0002 no such class.
-- =====================================================================================================
create function public.join_class(code text)
returns table (class_id uuid, class_name text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
-- (The result column is called class_id, like the table column; use_column makes SQL inside mean the table's.)
declare
  found_class public.classes;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if (select private.my_role()) is distinct from 'student' then
    raise exception 'only students can join a class' using errcode = '42501';
  end if;

  select * into found_class from public.classes where join_code = upper(trim(code));
  if not found then
    raise exception 'no class with this code' using errcode = 'P0002';
  end if;

  insert into public.class_members (student_id, class_id, consent_at)
  values ((select auth.uid()), found_class.id, now())
  on conflict (student_id) do update
    set class_id = excluded.class_id, consent_at = excluded.consent_at, joined_at = now();

  return query select found_class.id, found_class.name;
end;
$$;

-- =====================================================================================================
-- set_role(target, role): admins promote teachers (or demote). An admin can't change their own role,
-- so the last admin can't lock everyone out by accident.
-- =====================================================================================================
create function public.set_role(target uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if new_role not in ('admin', 'teacher', 'student') then
    raise exception 'unknown role' using errcode = '22023';
  end if;
  if target = (select auth.uid()) then
    raise exception 'admins cannot change their own role' using errcode = '42501';
  end if;
  update public.profiles set role = new_role where id = target;
  if not found then
    raise exception 'no such user' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.join_class(text), public.set_role(uuid, text) from public, anon;
grant execute on function public.join_class(text), public.set_role(uuid, text) to authenticated;
