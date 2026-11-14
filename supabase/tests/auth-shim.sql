-- LOCAL TESTS ONLY — never part of the migrations. Minimal stand-in for Supabase Auth on a
-- plain Postgres (e.g. pgvector/pgvector) or on supabase/postgres before GoTrue has run.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to postgres;
create schema if not exists auth;
create schema if not exists extensions;
create table if not exists auth.users (
  instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255), email varchar(255),
  encrypted_password varchar(255), email_confirmed_at timestamptz, raw_app_meta_data jsonb,
  raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz);
alter table auth.users add column if not exists confirmation_token varchar(255);
alter table auth.users add column if not exists recovery_token varchar(255);
alter table auth.users add column if not exists email_change_token_new varchar(255);
alter table auth.users add column if not exists email_change varchar(255);
alter table auth.users add column if not exists is_anonymous boolean not null default false;
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(), provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade, identity_data jsonb not null,
  provider text not null, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
  constraint identities_provider_id_provider_unique unique (provider_id, provider));
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub', '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant all on all tables in schema auth to postgres;
grant execute on all functions in schema auth to anon, authenticated, service_role, postgres;
