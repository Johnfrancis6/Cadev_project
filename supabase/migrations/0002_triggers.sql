-- devloop — 0002: triggers (profile creation, search vector, counters, reputation,
-- notifications, rate limits). All trigger functions are SECURITY DEFINER with an empty
-- search_path and are never callable through the API (execute revoked in 0006).
--
-- Error convention (see docs/BACKEND.md): the message starts with a stable code —
-- rate_limited | validation | forbidden | not_found | conflict | unauthenticated.

-- ---------------------------------------------------------------- helpers
create or replace function private.uid()
returns uuid language plpgsql stable
set search_path = ''
as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'unauthenticated: sign in first' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- Effective interest weight: decays 2 % per day since the last update.
create or replace function private.eff_weight(p_weight real, p_updated_at timestamptz)
returns double precision language sql stable
set search_path = ''
as $$
  select p_weight::double precision
       * power(0.98::double precision, greatest(0, extract(epoch from (now() - p_updated_at)) / 86400.0)::double precision)
$$;

create or replace function private.level_rank(p public.level_t)
returns integer language sql immutable
set search_path = ''
as $$ select case p when 'beginner' then 0 when 'intermediate' then 1 else 2 end $$;

-- Inserts a notification. Never notifies yourself, never during admin/seed operations
-- (no JWT), and collapses repeats of the same thing within 24 h.
create or replace function private.notify(p_user uuid, p_type text, p_actor uuid, p_post uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if p_user is null or p_actor is null or p_user = p_actor or auth.uid() is null then
    return;
  end if;
  if exists (select 1 from public.notifications n
             where n.user_id = p_user and n.type = p_type and n.actor_id = p_actor
               and n.post_id is not distinct from p_post
               and n.created_at > now() - interval '24 hours') then
    return;
  end if;
  insert into public.notifications (user_id, type, actor_id, post_id)
  values (p_user, p_type, p_actor, p_post);
end $$;

-- ---------------------------------------------------------------- auth.users → profiles
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  m        jsonb   := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_guest  boolean := coalesce(new.is_anonymous, false);
  v_n      integer := 1000 + (('x' || substr(md5(new.id::text), 1, 6))::bit(24)::integer % 9000);
  v_name   text;
  v_base   text;
  v_handle text;
  v_avatar text;
  v_gh     text;
  i        integer := 0;
begin
  begin
    v_name := nullif(btrim(regexp_replace(
                coalesce(nullif(m ->> 'display_name', ''), nullif(m ->> 'full_name', ''),
                         nullif(m ->> 'name', ''), nullif(m ->> 'user_name', ''), ''),
                '[[:space:][:cntrl:]]+', ' ', 'g')), '');
    if v_name is null then
      v_name := case when v_guest then 'Invité ' || v_n
                     else coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Dev ' || v_n) end;
    end if;
    v_name := left(v_name, 60);

    if coalesce(new.raw_app_meta_data ->> 'provider', '') = 'github'
       and (m ->> 'user_name') ~ '^[A-Za-z0-9-]{1,39}$' then
      v_gh := m ->> 'user_name';
    end if;
    if (m ->> 'avatar_url') ~ '^https://[^[:space:]]+$' and char_length(m ->> 'avatar_url') <= 500 then
      v_avatar := m ->> 'avatar_url';
    end if;

    v_base := case when v_guest then 'invite_' || v_n
              else lower(public.f_unaccent(coalesce(nullif(m ->> 'user_name', ''), nullif(m ->> 'preferred_username', ''),
                         nullif(split_part(coalesce(new.email, ''), '@', 1), ''), v_name))) end;
    v_base := left(btrim(regexp_replace(v_base, '[^a-z0-9_]+', '_', 'g'), '_'), 18);
    if v_base is null or char_length(v_base) < 3 then
      v_base := 'dev_' || v_n;
    end if;
    v_handle := v_base;
    loop
      exit when not exists (select 1 from public.profiles p where p.handle::text = v_handle);
      i := i + 1;
      if i > 5 then
        v_handle := 'u_' || substr(replace(new.id::text, '-', ''), 1, 20);
        exit;
      end if;
      v_handle := v_base || '_' || substr(md5(new.id::text || i::text), 1, 4);
    end loop;

    insert into public.profiles (id, handle, display_name, avatar_url, github_login, is_guest)
    values (new.id, v_handle, v_name, v_avatar, v_gh, v_guest)
    on conflict (id) do nothing;
  exception when others then
    -- Sign-up must never fail because of odd metadata: fall back to guaranteed-valid values.
    insert into public.profiles (id, handle, display_name, is_guest)
    values (new.id, 'u_' || substr(replace(new.id::text, '-', ''), 1, 20),
            case when v_guest then 'Invité ' || v_n else 'Dev ' || v_n end, v_guest)
    on conflict (id) do nothing;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A guest who later links an e-mail/GitHub identity stops being a guest.
create or replace function public.handle_user_upgraded()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if coalesce(old.is_anonymous, false) and not coalesce(new.is_anonymous, false) then
    update public.profiles set is_guest = false where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_upgraded on auth.users;
create trigger on_auth_user_upgraded
  after update of is_anonymous on auth.users
  for each row execute function public.handle_user_upgraded();

-- ---------------------------------------------------------------- posts.fts
create or replace function private.post_fts(p_id uuid, p_title text, p_body text, p_code text)
returns tsvector language sql stable
set search_path = ''
as $$
  select setweight(to_tsvector('public.devloop_fts'::regconfig, coalesce(p_title, '')), 'A')
      || setweight(to_tsvector('public.devloop_fts'::regconfig, coalesce((
           select string_agg(i.slug || ' ' || i.label_fr || ' ' || i.label_en, ' ')
           from public.post_tags t join public.interests i on i.id = t.interest_id
           where t.post_id = p_id), '')), 'B')
      || setweight(to_tsvector('public.devloop_fts'::regconfig,
           left(coalesce(p_body, ''), 10000) || ' ' || left(coalesce(p_code, ''), 20000)), 'C')
$$;

create or replace function public.tg_posts_before_write()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  new.fts := private.post_fts(new.id, new.title, new.body_md, new.code);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists posts_before_insert on public.posts;
create trigger posts_before_insert before insert on public.posts
  for each row execute function public.tg_posts_before_write();
drop trigger if exists posts_before_update on public.posts;
create trigger posts_before_update
  before update of title, body_md, code, language, repro, difficulty, kind, circle_id, ai_summary, ai_hints on public.posts
  for each row execute function public.tg_posts_before_write();

-- Tags: at most 5 (immediate), at least 1 (checked at commit so post + tags can be one transaction).
create or replace function public.tg_post_tags_write()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_post uuid;
begin
  if tg_op = 'INSERT' then
    v_post := new.post_id;
    if (select count(*) from public.post_tags t where t.post_id = v_post) > 5 then
      raise exception 'validation: a post has at most 5 tags' using errcode = 'P0001';
    end if;
  else
    v_post := old.post_id;
  end if;
  update public.posts p set fts = private.post_fts(p.id, p.title, p.body_md, p.code) where p.id = v_post;
  return null;
end $$;

drop trigger if exists post_tags_after_write on public.post_tags;
create trigger post_tags_after_write after insert or delete on public.post_tags
  for each row execute function public.tg_post_tags_write();

create or replace function public.tg_post_min_tags()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_post uuid;
begin
  if tg_table_name = 'posts' then
    v_post := new.id;
  else
    v_post := old.post_id;
  end if;
  if exists (select 1 from public.posts p where p.id = v_post)
     and not exists (select 1 from public.post_tags t where t.post_id = v_post) then
    raise exception 'validation: a post needs between 1 and 5 tags' using errcode = 'P0001';
  end if;
  return null;
end $$;

drop trigger if exists posts_min_tags on public.posts;
create constraint trigger posts_min_tags after insert on public.posts
  deferrable initially deferred for each row execute function public.tg_post_min_tags();
drop trigger if exists post_tags_min_tags on public.post_tags;
create constraint trigger post_tags_min_tags after delete on public.post_tags
  deferrable initially deferred for each row execute function public.tg_post_min_tags();

-- ---------------------------------------------------------------- answers: counters, reputation, notifications
create or replace function public.tg_answers_after_insert()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_author uuid;
begin
  update public.posts set answer_count = answer_count + 1 where id = new.post_id
  returning author_id into v_author;
  perform private.notify(v_author, 'answer', new.author_id, new.post_id);
  return null;
end $$;

drop trigger if exists answers_after_insert on public.answers;
create trigger answers_after_insert after insert on public.answers
  for each row execute function public.tg_answers_after_insert();

create or replace function public.tg_answers_after_delete()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_author uuid;
begin
  delete from public.votes v where v.target_type = 'answer' and v.target_id = old.id;
  update public.posts set answer_count = greatest(0, answer_count - 1) where id = old.post_id
  returning author_id into v_author;
  if old.is_accepted and v_author is not null then
    update public.posts set status = 'open', accepted_answer_id = null where id = old.post_id;
    if v_author <> old.author_id then
      update public.profiles set reputation = greatest(0, reputation - 15) where id = old.author_id;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists answers_after_delete on public.answers;
create trigger answers_after_delete after delete on public.answers
  for each row execute function public.tg_answers_after_delete();

create or replace function public.tg_answers_accepted()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_author uuid;
begin
  if new.is_accepted is not distinct from old.is_accepted then
    return null;
  end if;
  select p.author_id into v_author from public.posts p where p.id = new.post_id;
  if v_author is null or v_author = new.author_id then
    return null;  -- accepting your own answer earns nothing
  end if;
  if new.is_accepted then
    update public.profiles set reputation = reputation + 15 where id = new.author_id;
    perform private.notify(new.author_id, 'accepted', v_author, new.post_id);
  else
    update public.profiles set reputation = greatest(0, reputation - 15) where id = new.author_id;
  end if;
  return null;
end $$;

drop trigger if exists answers_accepted on public.answers;
create trigger answers_accepted after update of is_accepted on public.answers
  for each row execute function public.tg_answers_accepted();

create or replace function public.tg_posts_after_delete()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.votes v where v.target_type = 'post' and v.target_id = old.id;
  return null;
end $$;

drop trigger if exists posts_after_delete on public.posts;
create trigger posts_after_delete after delete on public.posts
  for each row execute function public.tg_posts_after_delete();

-- ---------------------------------------------------------------- votes: counter + reputation + notification
create or replace function public.tg_votes_write()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  r        public.votes;
  d        integer := case when tg_op = 'INSERT' then 1 else -1 end;
  v_author uuid;
  v_post   uuid;
begin
  if tg_op = 'INSERT' then
    r := new;
  else
    r := old;
  end if;
  if r.target_type = 'post' then
    update public.posts set helpful_count = greatest(0, helpful_count + d) where id = r.target_id
    returning author_id, id into v_author, v_post;
  else
    update public.answers set helpful_count = greatest(0, helpful_count + d) where id = r.target_id
    returning author_id, post_id into v_author, v_post;
  end if;
  if v_author is null then
    if tg_op = 'INSERT' then
      raise exception 'not_found: vote target does not exist' using errcode = 'P0001';
    end if;
    return null;
  end if;
  if v_author <> r.user_id then  -- voting for yourself counts but earns nothing
    update public.profiles set reputation = greatest(0, reputation + 2 * d) where id = v_author;
    if tg_op = 'INSERT' then
      perform private.notify(v_author, 'helpful', r.user_id, v_post);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists votes_after_write on public.votes;
create trigger votes_after_write after insert or delete on public.votes
  for each row execute function public.tg_votes_write();

-- ---------------------------------------------------------------- follows → notification
create or replace function public.tg_follows_after_insert()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.notify(new.followee_id, 'follow', new.follower_id, null);
  return null;
end $$;

drop trigger if exists follows_after_insert on public.follows;
create trigger follows_after_insert after insert on public.follows
  for each row execute function public.tg_follows_after_insert();

-- ---------------------------------------------------------------- rate limits
-- Applies to every API caller (anyone with a JWT). Admin/seed sessions have no JWT and are exempt.
create or replace function public.tg_rate_limit()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_max    integer  := tg_argv[0]::integer;
  v_window interval := tg_argv[1]::interval;
  v_col    text     := tg_argv[2];
  v_user   uuid;
  v_count  integer;
begin
  if auth.uid() is null then
    return new;
  end if;
  v_user := (to_jsonb(new) ->> v_col)::uuid;
  execute format('select count(*) from public.%I where %I = $1 and created_at > now() - $2', tg_table_name, v_col)
    into v_count using v_user, v_window;
  if v_count >= v_max then
    raise exception 'rate_limited: at most % % per %', v_max, tg_table_name, v_window using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists posts_rate_limit on public.posts;
create trigger posts_rate_limit before insert on public.posts
  for each row execute function public.tg_rate_limit('10', '1 hour', 'author_id');
drop trigger if exists answers_rate_limit on public.answers;
create trigger answers_rate_limit before insert on public.answers
  for each row execute function public.tg_rate_limit('30', '1 hour', 'author_id');
drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit before insert on public.messages
  for each row execute function public.tg_rate_limit('20', '1 minute', 'author_id');
drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit before insert on public.reports
  for each row execute function public.tg_rate_limit('20', '1 hour', 'reporter_id');
drop trigger if exists follows_rate_limit on public.follows;
create trigger follows_rate_limit before insert on public.follows
  for each row execute function public.tg_rate_limit('120', '1 hour', 'follower_id');

-- AI budget: 20 calls/day, guests 8. Enforced on the counter itself.
create or replace function public.tg_ai_usage_limit()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_limit integer;
begin
  select case when p.is_guest then 8 else 20 end into v_limit from public.profiles p where p.id = new.user_id;
  if new.calls > coalesce(v_limit, 8) then
    raise exception 'rate_limited: daily AI budget reached (%)', coalesce(v_limit, 8) using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists ai_usage_limit on public.ai_usage;
create trigger ai_usage_limit before insert or update on public.ai_usage
  for each row execute function public.tg_ai_usage_limit();
