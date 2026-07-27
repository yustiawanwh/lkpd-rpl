-- Meniru lingkungan Supabase secukupnya untuk menguji skema secara lokal.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- auth.uid() membaca pengguna aktif dari setelan sesi.
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Peran yang dipakai Supabase.
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- Supabase memberikan hak tabel kepada peran anon/authenticated
-- secara bawaan; RLS-lah yang kemudian menyaring barisnya.
-- Di simulasi lokal, hak itu harus diberikan manual.
-- ------------------------------------------------------------
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
