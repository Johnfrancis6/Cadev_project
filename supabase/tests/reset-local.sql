-- LOCAL TEST DATABASES ONLY. Run as a superuser (supabase_admin) to wipe everything the
-- migrations and the seed create, and to restore Supabase's default privileges on `public`.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_upgraded on auth.users;
delete from auth.users;
drop schema if exists private cascade;
drop schema if exists tests cascade;
drop schema public cascade;
create schema public authorization pg_database_owner;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres;
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    drop publication supabase_realtime;
  end if;
  create publication supabase_realtime;
end $$;
