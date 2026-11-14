-- devloop — 0001: extensions, types, tables, constraints, indexes.
-- Re-runnable: every statement is guarded (if not exists / do-blocks).

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;
create extension if not exists vector   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Internal helpers live here; the schema is NOT exposed by the Data API.
create schema if not exists private;

-- New objects created later by the same role are not auto-exposed to API roles.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

do $$ begin
  create type public.level_t as enum ('beginner', 'intermediate', 'senior');
exception when duplicate_object then null; end $$;

-- Accent-insensitive, language-neutral text search configuration (French + English).
do $$ begin
  if not exists (select 1 from pg_catalog.pg_ts_config c join pg_catalog.pg_namespace n on n.oid = c.cfgnamespace
                 where n.nspname = 'public' and c.cfgname = 'devloop_fts') then
    create text search configuration public.devloop_fts (copy = pg_catalog.simple);
    alter text search configuration public.devloop_fts
      alter mapping for asciiword, asciihword, hword_asciipart, word, hword, hword_part
      with extensions.unaccent, pg_catalog.simple;
  end if;
end $$;

-- Immutable wrapper so it can be used in an index expression.
create or replace function public.f_unaccent(p text)
returns text language sql immutable parallel safe strict
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, p) $$;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  handle        extensions.citext not null unique,
  display_name  text not null,
  avatar_url    text,
  bio           text not null default '',
  level         public.level_t not null default 'intermediate',
  github_login  text,
  locale        text not null default 'fr',
  is_guest      boolean not null default false,
  onboarded     boolean not null default false,
  reputation    integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint profiles_handle_format check (handle::text ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 60),
  constraint profiles_avatar_url check (avatar_url is null or (char_length(avatar_url) <= 500
      and avatar_url ~ '^(https://[^[:space:]]+|/[A-Za-z0-9_./-]+)$')),
  constraint profiles_bio_len check (char_length(bio) <= 280),
  constraint profiles_github_login check (github_login is null or github_login ~ '^[A-Za-z0-9-]{1,39}$'),
  constraint profiles_locale check (locale in ('fr', 'en')),
  constraint profiles_reputation check (reputation >= 0)
);

-- ---------------------------------------------------------------- interests
create table if not exists public.interests (
  id        smallint primary key,
  slug      text not null unique,
  label_fr  text not null,
  label_en  text not null,
  constraint interests_slug_format check (slug ~ '^[a-z0-9-]{1,32}$')
);

insert into public.interests (id, slug, label_fr, label_en) values
  (1, 'javascript', 'JavaScript', 'JavaScript'), (2, 'typescript', 'TypeScript', 'TypeScript'),
  (3, 'react', 'React', 'React'), (4, 'nodejs', 'Node.js', 'Node.js'),
  (5, 'python', 'Python', 'Python'), (6, 'django', 'Django', 'Django'),
  (7, 'data-ai', 'Data & IA', 'Data & AI'), (8, 'databases', 'Bases de données', 'Databases'),
  (9, 'devops', 'DevOps', 'DevOps'), (10, 'mobile', 'Mobile', 'Mobile'),
  (11, 'css', 'CSS', 'CSS'), (12, 'git', 'Git', 'Git'),
  (13, 'security', 'Sécurité', 'Security'), (14, 'testing', 'Tests', 'Testing'),
  (15, 'career', 'Carrière', 'Career'), (16, 'java', 'Java', 'Java'),
  (17, 'php', 'PHP', 'PHP'), (18, 'go', 'Go', 'Go')
on conflict (id) do nothing;

create table if not exists public.user_interests (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  interest_id  smallint not null references public.interests (id) on delete cascade,
  weight       real not null default 0.6,
  muted        boolean not null default false,
  source       text not null default 'behavior',
  base_weight  real,
  updated_at   timestamptz not null default now(),
  primary key (user_id, interest_id),
  constraint user_interests_weight check (weight >= 0 and weight <= 1),
  constraint user_interests_base_weight check (base_weight is null or (base_weight >= 0 and base_weight <= 1)),
  constraint user_interests_source check (source in ('onboarding', 'github', 'behavior', 'manual'))
);

create table if not exists public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  followee_id  uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);

-- ---------------------------------------------------------------- circles
create table if not exists public.circles (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  name                 text not null,
  description_fr       text not null default '',
  description_en       text not null default '',
  interest_id          smallint references public.interests (id) on delete set null,
  external_invite_url  text,
  created_at           timestamptz not null default now(),
  constraint circles_slug_format check (slug ~ '^[a-z0-9-]{2,40}$'),
  constraint circles_name_len check (char_length(name) between 1 and 80),
  constraint circles_desc_len check (char_length(description_fr) <= 500 and char_length(description_en) <= 500),
  constraint circles_invite_url check (external_invite_url is null or (char_length(external_invite_url) <= 300
      and external_invite_url ~ '^https://[^[:space:]]+$'))
);

create table if not exists public.circle_members (
  circle_id  uuid not null references public.circles (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index if not exists circle_members_user_idx on public.circle_members (user_id);

-- ---------------------------------------------------------------- posts & answers
create table if not exists public.posts (
  id                  uuid primary key default gen_random_uuid(),
  author_id           uuid not null references public.profiles (id) on delete cascade,
  circle_id           uuid references public.circles (id) on delete set null,
  kind                text not null default 'problem',
  title               text not null,
  body_md             text not null default '',
  code                text,
  language            text,
  repro               jsonb,
  difficulty          public.level_t not null default 'intermediate',
  ai_summary          text,
  ai_hints            text[] not null default '{}',
  status              text not null default 'open',
  accepted_answer_id  uuid,
  embedding           extensions.vector(384),
  fts                 tsvector,
  helpful_count       integer not null default 0,
  answer_count        integer not null default 0,
  view_count          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint posts_kind check (kind in ('problem', 'discussion')),
  constraint posts_status check (status in ('open', 'solved')),
  constraint posts_title_len check (char_length(title) between 8 and 160),
  constraint posts_body_len check (char_length(body_md) <= 10000),
  constraint posts_code_len check (code is null or char_length(code) <= 20000),
  constraint posts_language check (language is null or language ~ '^[A-Za-z0-9+#._-]{1,32}$'),
  constraint posts_repro check (repro is null or (
      jsonb_typeof(repro) = 'object' and octet_length(repro::text) <= 60000
      and jsonb_typeof(repro -> 'html') = 'string' and jsonb_typeof(repro -> 'css') = 'string'
      and jsonb_typeof(repro -> 'js') = 'string' and (repro - 'html' - 'css' - 'js') = '{}'::jsonb)),
  constraint posts_ai_summary_len check (ai_summary is null or char_length(ai_summary) <= 600),
  constraint posts_ai_hints check (coalesce(array_length(ai_hints, 1), 0) <= 5
      and char_length(array_to_string(ai_hints, '')) <= 1500),
  constraint posts_counters check (helpful_count >= 0 and answer_count >= 0 and view_count >= 0)
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists posts_circle_idx on public.posts (circle_id, created_at desc);
create index if not exists posts_fts_idx on public.posts using gin (fts);
create index if not exists posts_title_trgm_idx on public.posts
  using gin (public.f_unaccent(lower(title)) extensions.gin_trgm_ops);
-- HNSW works on an empty table (IVFFlat needs data to build its lists).
create index if not exists posts_embedding_idx on public.posts
  using hnsw (embedding extensions.vector_cosine_ops);

create table if not exists public.post_tags (
  post_id      uuid not null references public.posts (id) on delete cascade,
  interest_id  smallint not null references public.interests (id) on delete cascade,
  primary key (post_id, interest_id)
);
create index if not exists post_tags_interest_idx on public.post_tags (interest_id);

create table if not exists public.answers (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid not null references public.posts (id) on delete cascade,
  author_id      uuid not null references public.profiles (id) on delete cascade,
  body_md        text not null,
  repro          jsonb,
  is_ai          boolean not null default false,
  is_accepted    boolean not null default false,
  accepted_at    timestamptz,
  helpful_count  integer not null default 0,
  created_at     timestamptz not null default now(),
  constraint answers_body_len check (char_length(body_md) between 1 and 10000),
  constraint answers_repro check (repro is null or (
      jsonb_typeof(repro) = 'object' and octet_length(repro::text) <= 60000
      and jsonb_typeof(repro -> 'html') = 'string' and jsonb_typeof(repro -> 'css') = 'string'
      and jsonb_typeof(repro -> 'js') = 'string' and (repro - 'html' - 'css' - 'js') = '{}'::jsonb)),
  constraint answers_counters check (helpful_count >= 0)
);
create index if not exists answers_post_idx on public.answers (post_id, created_at);
create index if not exists answers_author_idx on public.answers (author_id, created_at desc);

do $$ begin
  alter table public.posts add constraint posts_accepted_answer_fk
    foreign key (accepted_answer_id) references public.answers (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- interactions
create table if not exists public.votes (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  target_type  text not null,
  target_id    uuid not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, target_type, target_id),
  constraint votes_target_type check (target_type in ('post', 'answer'))
);
create index if not exists votes_target_idx on public.votes (target_type, target_id);

create table if not exists public.saves (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  post_id     uuid not null references public.posts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  post_id     uuid not null references public.posts (id) on delete cascade,
  type        text not null,
  value       real,
  created_at  timestamptz not null default now(),
  constraint events_type check (type in ('impression', 'open', 'dwell', 'expand_code', 'copy_code',
      'run_repro', 'helpful', 'save', 'answer', 'accept', 'less'))
);
create index if not exists events_user_created_idx on public.events (user_id, created_at desc);
create index if not exists events_user_post_idx on public.events (user_id, post_id, type, created_at desc);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint messages_body_len check (char_length(body) between 1 and 1000)
);
create index if not exists messages_circle_idx on public.messages (circle_id, created_at desc);
create index if not exists messages_author_idx on public.messages (author_id, created_at desc);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  actor_id    uuid not null references public.profiles (id) on delete cascade,
  post_id     uuid references public.posts (id) on delete cascade,
  read        boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint notifications_type check (type in ('answer', 'accepted', 'helpful', 'follow'))
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  target_type  text not null,
  target_id    uuid not null,
  reason       text not null,
  created_at   timestamptz not null default now(),
  constraint reports_target_type check (target_type in ('post', 'answer', 'message')),
  constraint reports_reason_len check (char_length(reason) between 1 and 500),
  constraint reports_unique unique (reporter_id, target_type, target_id)
);

-- ---------------------------------------------------------------- AI gateway bookkeeping (service role only)
create table if not exists public.ai_cache (
  hash        text primary key,
  task        text not null,
  response    jsonb not null,
  provider    text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.ai_usage (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  day      date not null default (now() at time zone 'utc')::date,
  calls    integer not null default 0,
  primary key (user_id, day)
);
