-- devloop — 0006: write RPCs. SECURITY INVOKER (RLS + column privileges apply) unless the
-- function must touch protected columns; those are SECURITY DEFINER, check auth.uid()
-- themselves and only ever act on behalf of the caller.

-- ---------------------------------------------------------------- learning
-- DEFINER: events and learned weights are not writable by clients.
-- Gains: w ← clamp01(w + gain·(1 − w)); `less` halves. The gain of one (post, type) pair is
-- applied at most once per hour, so replaying a signal cannot inflate a weight.
create or replace function public.record_event(p_post_id uuid, p_type text, p_value real default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.uid();
  v_gain double precision;
  v_dup  boolean;
begin
  if p_type is null or p_type not in ('impression', 'open', 'dwell', 'expand_code', 'copy_code',
       'run_repro', 'helpful', 'save', 'answer', 'accept', 'less') then
    raise exception 'validation: unknown event type' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.posts p where p.id = p_post_id) then
    return jsonb_build_object('applied', false);
  end if;
  if (select count(*) from public.events e where e.user_id = v_uid and e.created_at > now() - interval '1 hour') >= 1000 then
    return jsonb_build_object('applied', false);
  end if;
  v_dup := exists (select 1 from public.events e where e.user_id = v_uid and e.post_id = p_post_id
                   and e.type = p_type and e.created_at > now() - interval '1 hour');
  if v_dup and p_type = 'impression' then
    return jsonb_build_object('applied', false);
  end if;
  insert into public.events (user_id, post_id, type, value) values (v_uid, p_post_id, p_type, p_value);
  if v_dup then
    return jsonb_build_object('applied', false);
  end if;

  if p_type = 'open' then
    update public.posts set view_count = view_count + 1 where id = p_post_id;
  end if;

  v_gain := case p_type
    when 'open' then 0.08
    when 'dwell' then case when coalesce(p_value, 0) >= 10 then 0.08 else 0 end
    when 'expand_code' then 0.05 when 'copy_code' then 0.10 when 'run_repro' then 0.10
    when 'helpful' then 0.12 when 'save' then 0.12 when 'answer' then 0.20 when 'accept' then 0.20
    else 0 end;

  if p_type = 'less' then
    update public.user_interests ui
       set weight = (private.eff_weight(ui.weight, ui.updated_at) / 2)::real, updated_at = now()
     where ui.user_id = v_uid and not ui.muted
       and ui.interest_id in (select t.interest_id from public.post_tags t where t.post_id = p_post_id);
  elsif v_gain > 0 then
    insert into public.user_interests as ui (user_id, interest_id, weight, source, base_weight)
    select v_uid, t.interest_id, v_gain::real, 'behavior', null
    from public.post_tags t where t.post_id = p_post_id
    on conflict (user_id, interest_id) do update
      set weight = least(1, greatest(0, private.eff_weight(ui.weight, ui.updated_at)
                   + v_gain * (1 - private.eff_weight(ui.weight, ui.updated_at))))::real,
          updated_at = now()
      where not ui.muted;
  else
    return jsonb_build_object('applied', false);
  end if;

  return jsonb_build_object('applied', true, 'interests', coalesce((
    select jsonb_agg(jsonb_build_object('slug', i.slug, 'weight', round(ui.weight::numeric, 3)) order by i.id)
    from public.post_tags t
    join public.interests i on i.id = t.interest_id
    join public.user_interests ui on ui.interest_id = t.interest_id and ui.user_id = v_uid
    where t.post_id = p_post_id), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- interests (owner writes, RLS)
create or replace function public.set_interest_weight(p_interest_id integer, p_weight real)
returns void language plpgsql
set search_path = ''
as $$
declare v_uid uuid := private.uid();
begin
  if p_weight is null or p_weight < 0 or p_weight > 1 then
    raise exception 'validation: weight must be between 0 and 1' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.interests i where i.id = p_interest_id) then
    raise exception 'not_found: interest' using errcode = 'P0001';
  end if;
  insert into public.user_interests as ui (user_id, interest_id, weight, source, base_weight)
  values (v_uid, p_interest_id::smallint, p_weight, 'manual', p_weight)
  on conflict (user_id, interest_id) do update
    set weight = excluded.weight, base_weight = excluded.weight, updated_at = now(),
        source = case when ui.source = 'behavior' then 'manual' else ui.source end;
end $$;

create or replace function public.set_interest_muted(p_interest_id integer, p_muted boolean)
returns void language plpgsql
set search_path = ''
as $$
declare v_uid uuid := private.uid();
begin
  if not exists (select 1 from public.interests i where i.id = p_interest_id) then
    raise exception 'not_found: interest' using errcode = 'P0001';
  end if;
  insert into public.user_interests as ui (user_id, interest_id, weight, muted, source, base_weight)
  values (v_uid, p_interest_id::smallint, 0, coalesce(p_muted, true), 'manual', 0)
  on conflict (user_id, interest_id) do update set muted = excluded.muted;
end $$;

-- p_items: [{ "slug", "weight", "source" }]
create or replace function public.save_interests(p_items jsonb)
returns void language plpgsql
set search_path = ''
as $$
declare v_uid uuid := private.uid();
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 40 then
    raise exception 'validation: items must be an array' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'weight') <> 'number'
       or (x ->> 'weight')::numeric < 0 or (x ->> 'weight')::numeric > 1
       or coalesce(x ->> 'source', 'manual') not in ('onboarding', 'github', 'behavior', 'manual')
       or not exists (select 1 from public.interests i where i.slug = x ->> 'slug')) then
    raise exception 'validation: invalid interest item' using errcode = 'P0001';
  end if;
  insert into public.user_interests as ui (user_id, interest_id, weight, source, base_weight)
  select distinct on (i.id) v_uid, i.id, (x ->> 'weight')::real, coalesce(x ->> 'source', 'manual'),
         case when coalesce(x ->> 'source', 'manual') = 'behavior' then null else (x ->> 'weight')::real end
  from jsonb_array_elements(p_items) x join public.interests i on i.slug = x ->> 'slug'
  order by i.id
  on conflict (user_id, interest_id) do update
    set weight = excluded.weight, source = excluded.source,
        base_weight = coalesce(excluded.base_weight, ui.base_weight), updated_at = now();
end $$;

-- DEFINER: also forgets the caller's behaviour events (not deletable by clients).
create or replace function public.reset_learning()
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_uid uuid := private.uid();
begin
  delete from public.user_interests where user_id = v_uid and (source = 'behavior' or base_weight is null);
  update public.user_interests set weight = base_weight, updated_at = now() where user_id = v_uid;
  delete from public.events where user_id = v_uid;
end $$;

-- DEFINER: sets `onboarded`, which clients cannot write.
create or replace function public.complete_onboarding(p_level text, p_slugs text[], p_display_name text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.uid();
  v_name text := nullif(btrim(regexp_replace(coalesce(p_display_name, ''), '[[:space:][:cntrl:]]+', ' ', 'g')), '');
  v_p    public.profiles;
begin
  if p_level is null or p_level not in ('beginner', 'intermediate', 'senior') then
    raise exception 'validation: unknown level' using errcode = 'P0001';
  end if;
  if v_name is not null and char_length(v_name) > 60 then
    raise exception 'validation: display name is too long' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_slugs, 1), 0) > 18
     or exists (select 1 from unnest(coalesce(p_slugs, '{}'::text[])) s
                where not exists (select 1 from public.interests i where i.slug = s)) then
    raise exception 'validation: unknown interest' using errcode = 'P0001';
  end if;
  insert into public.user_interests as ui (user_id, interest_id, weight, source, base_weight)
  select v_uid, i.id, 0.6, 'onboarding', 0.6
  from public.interests i where i.slug = any (coalesce(p_slugs, '{}'::text[]))
  on conflict (user_id, interest_id) do update
    set weight = greatest(ui.weight, 0.6), base_weight = greatest(coalesce(ui.base_weight, 0), 0.6),
        source = case when ui.source = 'behavior' then 'onboarding' else ui.source end, updated_at = now();
  update public.profiles
     set level = p_level::public.level_t, display_name = coalesce(v_name, display_name), onboarded = true
   where id = v_uid
  returning * into v_p;
  return private.profile_json(v_p);
end $$;

-- p_patch keys: displayName, handle, bio, level, locale, avatarUrl (any subset).
create or replace function public.update_profile(p_patch jsonb)
returns jsonb language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := private.uid();
  v_p   public.profiles;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'validation: patch must be an object' using errcode = 'P0001';
  end if;
  if p_patch ? 'level' and coalesce(p_patch ->> 'level', '') not in ('beginner', 'intermediate', 'senior') then
    raise exception 'validation: unknown level' using errcode = 'P0001';
  end if;
  if p_patch ? 'handle' and coalesce(lower(btrim(p_patch ->> 'handle')), '') !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'validation: handle must be 3-24 characters: a-z, 0-9, _' using errcode = 'P0001';
  end if;
  begin
    update public.profiles p set
      display_name = case when p_patch ? 'displayName'
                          then btrim(regexp_replace(coalesce(p_patch ->> 'displayName', ''), '[[:space:][:cntrl:]]+', ' ', 'g'))
                          else p.display_name end,
      handle     = case when p_patch ? 'handle' then lower(btrim(p_patch ->> 'handle'))::extensions.citext else p.handle end,
      bio        = case when p_patch ? 'bio' then coalesce(p_patch ->> 'bio', '') else p.bio end,
      level      = case when p_patch ? 'level' then (p_patch ->> 'level')::public.level_t else p.level end,
      locale     = case when p_patch ? 'locale' then p_patch ->> 'locale' else p.locale end,
      avatar_url = case when p_patch ? 'avatarUrl' then nullif(p_patch ->> 'avatarUrl', '') else p.avatar_url end
    where p.id = v_uid
    returning * into v_p;
  exception
    when unique_violation then
      raise exception 'conflict: handle already taken' using errcode = 'P0001';
    when check_violation or not_null_violation then
      raise exception 'validation: %', sqlerrm using errcode = 'P0001';
  end;
  return private.profile_json(v_p);
end $$;

-- ---------------------------------------------------------------- social toggles (idempotent)
create or replace function public.set_following(p_user_id uuid, p_on boolean)
returns void language plpgsql
set search_path = ''
as $$
declare v_uid uuid := private.uid();
begin
  if p_user_id = v_uid then
    raise exception 'validation: you cannot follow yourself' using errcode = 'P0001';
  end if;
  if coalesce(p_on, true) then
    if not exists (select 1 from public.profiles p where p.id = p_user_id) then
      raise exception 'not_found: profile' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = p_user_id) then
      insert into public.follows (follower_id, followee_id) values (v_uid, p_user_id);
    end if;
  else
    delete from public.follows where follower_id = v_uid and followee_id = p_user_id;
  end if;
end $$;

create or replace function public.set_circle_member(p_circle_id uuid, p_on boolean)
returns void language plpgsql
set search_path = ''
as $$
declare v_uid uuid := private.uid();
begin
  if coalesce(p_on, true) then
    if not exists (select 1 from public.circles c where c.id = p_circle_id) then
      raise exception 'not_found: circle' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.circle_members m where m.circle_id = p_circle_id and m.user_id = v_uid) then
      insert into public.circle_members (circle_id, user_id) values (p_circle_id, v_uid);
    end if;
  else
    delete from public.circle_members where circle_id = p_circle_id and user_id = v_uid;
  end if;
end $$;

create or replace function public.set_saved(p_post_id uuid, p_on boolean)
returns void language plpgsql
set search_path = ''
as $$
declare v_uid uuid := private.uid();
begin
  if coalesce(p_on, true) then
    if not exists (select 1 from public.posts p where p.id = p_post_id) then
      raise exception 'not_found: post' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.saves s where s.user_id = v_uid and s.post_id = p_post_id) then
      insert into public.saves (user_id, post_id) values (v_uid, p_post_id);
    end if;
  else
    delete from public.saves where user_id = v_uid and post_id = p_post_id;
  end if;
end $$;

-- DEFINER: votes are only writable here; the votes trigger keeps counter, reputation (+2)
-- and notification in sync. Returns { on, helpfulCount }.
create or replace function public.set_helpful(p_target_type text, p_target_id uuid, p_on boolean)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.uid();
  v_count integer;
begin
  if p_target_type is null or p_target_type not in ('post', 'answer') then
    raise exception 'validation: target type must be post or answer' using errcode = 'P0001';
  end if;
  if coalesce(p_on, true) then
    if (p_target_type = 'post' and not exists (select 1 from public.posts p where p.id = p_target_id))
       or (p_target_type = 'answer' and not exists (select 1 from public.answers a where a.id = p_target_id)) then
      raise exception 'not_found: %', p_target_type using errcode = 'P0001';
    end if;
    if (select count(*) from public.votes v where v.user_id = v_uid and v.created_at > now() - interval '1 hour') >= 200 then
      raise exception 'rate_limited: too many votes' using errcode = 'P0001';
    end if;
    insert into public.votes (user_id, target_type, target_id) values (v_uid, p_target_type, p_target_id)
    on conflict do nothing;
  else
    delete from public.votes where user_id = v_uid and target_type = p_target_type and target_id = p_target_id;
  end if;
  if p_target_type = 'post' then
    select p.helpful_count into v_count from public.posts p where p.id = p_target_id;
  else
    select a.helpful_count into v_count from public.answers a where a.id = p_target_id;
  end if;
  return jsonb_build_object('on', coalesce(p_on, true), 'helpfulCount', coalesce(v_count, 0));
end $$;

-- DEFINER: only the post's author; toggles. Returns { status, acceptedAnswerId }.
-- Reputation ±15 and the notification come from the answers trigger.
create or replace function public.accept_answer(p_answer_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.uid();
  v_post public.posts;
  v_ans  public.answers;
begin
  select * into v_ans from public.answers a where a.id = p_answer_id;
  if not found then
    raise exception 'not_found: answer' using errcode = 'P0001';
  end if;
  select * into v_post from public.posts p where p.id = v_ans.post_id for update;
  if v_post.author_id <> v_uid then
    raise exception 'forbidden: only the author of the post can accept an answer' using errcode = 'P0001';
  end if;
  if v_post.accepted_answer_id = p_answer_id then
    update public.answers set is_accepted = false, accepted_at = null where id = p_answer_id;
    update public.posts set status = 'open', accepted_answer_id = null where id = v_post.id;
    return jsonb_build_object('status', 'open', 'acceptedAnswerId', null);
  end if;
  update public.answers set is_accepted = false, accepted_at = null
   where post_id = v_post.id and is_accepted and id <> p_answer_id;
  update public.answers set is_accepted = true, accepted_at = now() where id = p_answer_id;
  update public.posts set status = 'solved', accepted_answer_id = p_answer_id where id = v_post.id;
  return jsonb_build_object('status', 'solved', 'acceptedAnswerId', p_answer_id);
end $$;

-- ---------------------------------------------------------------- posts
create or replace function private.tag_ids(p_tags jsonb)
returns smallint[] language plpgsql stable
set search_path = ''
as $$
declare v smallint[];
begin
  if p_tags is null or jsonb_typeof(p_tags) <> 'array' or jsonb_array_length(p_tags) not between 1 and 5 then
    raise exception 'validation: a post needs between 1 and 5 tags' using errcode = 'P0001';
  end if;
  select array_agg(distinct i.id) into v
  from jsonb_array_elements_text(p_tags) s join public.interests i on i.slug = s;
  if coalesce(array_length(v, 1), 0) <> (select count(distinct s) from jsonb_array_elements_text(p_tags) s) then
    raise exception 'validation: unknown tag' using errcode = 'P0001';
  end if;
  return v;
end $$;

create or replace function private.text_array(p jsonb)
returns text[] language sql immutable
set search_path = ''
as $$
  select case when p is null or jsonb_typeof(p) <> 'array' then '{}'::text[]
              else array(select jsonb_array_elements_text(p)) end
$$;

-- p_input: contract PostInput { kind, title, bodyMd, code?, language?, repro?, tags, difficulty,
-- circleId?, aiSummary?, aiHints? }. Returns the created Post.
create or replace function public.create_post(p_input jsonb)
returns jsonb language plpgsql
set search_path = ''
as $$
declare
  v_uid  uuid := private.uid();
  v_tags smallint[];
  v_id   uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'validation: input must be an object' using errcode = 'P0001';
  end if;
  if coalesce(p_input ->> 'difficulty', 'intermediate') not in ('beginner', 'intermediate', 'senior') then
    raise exception 'validation: unknown difficulty' using errcode = 'P0001';
  end if;
  v_tags := private.tag_ids(p_input -> 'tags');
  begin
    insert into public.posts (author_id, circle_id, kind, title, body_md, code, language, repro, difficulty, ai_summary, ai_hints)
    values (v_uid, nullif(p_input ->> 'circleId', '')::uuid, coalesce(p_input ->> 'kind', 'problem'),
            btrim(coalesce(p_input ->> 'title', '')), coalesce(p_input ->> 'bodyMd', ''),
            nullif(p_input ->> 'code', ''), nullif(p_input ->> 'language', ''),
            nullif(p_input -> 'repro', 'null'::jsonb),
            coalesce(p_input ->> 'difficulty', 'intermediate')::public.level_t,
            nullif(p_input ->> 'aiSummary', ''), private.text_array(p_input -> 'aiHints'))
    returning id into v_id;
  exception
    when check_violation or not_null_violation or invalid_text_representation or foreign_key_violation then
      raise exception 'validation: %', sqlerrm using errcode = 'P0001';
  end;
  insert into public.post_tags (post_id, interest_id) select v_id, unnest(v_tags);
  return (select pj.j from private.posts_json(array[v_id]) pj);
end $$;

-- p_patch: any subset of PostInput. Returns the updated Post.
create or replace function public.update_post(p_id uuid, p_patch jsonb)
returns jsonb language plpgsql
set search_path = ''
as $$
declare
  v_uid  uuid := private.uid();
  v_tags smallint[];
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'validation: patch must be an object' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.posts p where p.id = p_id) then
    raise exception 'not_found: post' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.posts p where p.id = p_id and p.author_id = v_uid) then
    raise exception 'forbidden: not your post' using errcode = 'P0001';
  end if;
  if p_patch ? 'difficulty' and coalesce(p_patch ->> 'difficulty', '') not in ('beginner', 'intermediate', 'senior') then
    raise exception 'validation: unknown difficulty' using errcode = 'P0001';
  end if;
  begin
    update public.posts p set
      kind       = case when p_patch ? 'kind' then p_patch ->> 'kind' else p.kind end,
      title      = case when p_patch ? 'title' then btrim(coalesce(p_patch ->> 'title', '')) else p.title end,
      body_md    = case when p_patch ? 'bodyMd' then coalesce(p_patch ->> 'bodyMd', '') else p.body_md end,
      code       = case when p_patch ? 'code' then nullif(p_patch ->> 'code', '') else p.code end,
      language   = case when p_patch ? 'language' then nullif(p_patch ->> 'language', '') else p.language end,
      repro      = case when p_patch ? 'repro' then nullif(p_patch -> 'repro', 'null'::jsonb) else p.repro end,
      difficulty = case when p_patch ? 'difficulty' then (p_patch ->> 'difficulty')::public.level_t else p.difficulty end,
      circle_id  = case when p_patch ? 'circleId' then nullif(p_patch ->> 'circleId', '')::uuid else p.circle_id end,
      ai_summary = case when p_patch ? 'aiSummary' then nullif(p_patch ->> 'aiSummary', '') else p.ai_summary end,
      ai_hints   = case when p_patch ? 'aiHints' then private.text_array(p_patch -> 'aiHints') else p.ai_hints end
    where p.id = p_id;
  exception
    when check_violation or not_null_violation or invalid_text_representation or foreign_key_violation then
      raise exception 'validation: %', sqlerrm using errcode = 'P0001';
  end;
  if p_patch ? 'tags' then
    v_tags := private.tag_ids(p_patch -> 'tags');
    delete from public.post_tags t where t.post_id = p_id and t.interest_id <> all (v_tags);
    insert into public.post_tags (post_id, interest_id)
    select p_id, x from unnest(v_tags) x
    where not exists (select 1 from public.post_tags t where t.post_id = p_id and t.interest_id = x);
  end if;
  return (select pj.j from private.posts_json(array[p_id]) pj);
end $$;

create or replace function public.delete_post(p_id uuid)
returns void language plpgsql
set search_path = ''
as $$
declare v_uid uuid := private.uid();
begin
  if not exists (select 1 from public.posts p where p.id = p_id) then
    raise exception 'not_found: post' using errcode = 'P0001';
  end if;
  delete from public.posts p where p.id = p_id and p.author_id = v_uid;
  if not found then
    raise exception 'forbidden: not your post' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------- answers
-- p_input: contract AnswerInput { bodyMd, repro?, isAi? }. Returns the created Answer.
create or replace function public.create_answer(p_post_id uuid, p_input jsonb)
returns jsonb language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := private.uid();
  v_id  uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'validation: input must be an object' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.posts p where p.id = p_post_id) then
    raise exception 'not_found: post' using errcode = 'P0001';
  end if;
  begin
    insert into public.answers (post_id, author_id, body_md, repro, is_ai)
    values (p_post_id, v_uid, btrim(coalesce(p_input ->> 'bodyMd', '')),
            nullif(p_input -> 'repro', 'null'::jsonb), coalesce((p_input ->> 'isAi')::boolean, false))
    returning id into v_id;
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'validation: %', sqlerrm using errcode = 'P0001';
  end;
  return (select aj.j from private.answers_json(array[v_id]) aj);
end $$;

create or replace function public.delete_answer(p_id uuid)
returns void language plpgsql
set search_path = ''
as $$
declare v_uid uuid := private.uid();
begin
  if not exists (select 1 from public.answers a where a.id = p_id) then
    raise exception 'not_found: answer' using errcode = 'P0001';
  end if;
  delete from public.answers a where a.id = p_id and a.author_id = v_uid;
  if not found then
    raise exception 'forbidden: not your answer' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------- chat, notifications, reports
create or replace function public.send_message(p_circle_id uuid, p_body text)
returns jsonb language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := private.uid();
  v_m   public.messages;
begin
  if not exists (select 1 from public.circles c where c.id = p_circle_id) then
    raise exception 'not_found: circle' using errcode = 'P0001';
  end if;
  begin
    insert into public.messages (circle_id, author_id, body)
    values (p_circle_id, v_uid, btrim(coalesce(p_body, '')))
    returning * into v_m;
  exception when check_violation then
    raise exception 'validation: a message has between 1 and 1000 characters' using errcode = 'P0001';
  end;
  return private.message_json(v_m);
end $$;

create or replace function public.mark_notifications_read()
returns void language sql
set search_path = ''
as $$ update public.notifications set read = true where user_id = private.uid() and not read $$;

create or replace function public.report_content(p_target_type text, p_target_id uuid, p_reason text)
returns void language plpgsql
set search_path = ''
as $$
declare v_uid uuid := private.uid();
begin
  if p_target_type is null or p_target_type not in ('post', 'answer', 'message') then
    raise exception 'validation: unknown target type' using errcode = 'P0001';
  end if;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values (v_uid, p_target_type, p_target_id, left(btrim(coalesce(p_reason, '')), 500));
  exception
    when unique_violation then null;  -- already reported: idempotent
    when check_violation then
      raise exception 'validation: a reason is required' using errcode = 'P0001';
  end;
end $$;

-- ---------------------------------------------------------------- AI budget (service role only)
-- Takes one call from the user's daily budget. { allowed, calls, limit }.
create or replace function public.ai_consume(p_user_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_calls integer;
begin
  select case when p.is_guest then 8 else 20 end into v_limit from public.profiles p where p.id = p_user_id;
  if v_limit is null then
    return jsonb_build_object('allowed', false, 'calls', 0, 'limit', 0);
  end if;
  begin
    insert into public.ai_usage as u (user_id, day, calls)
    values (p_user_id, (now() at time zone 'utc')::date, 1)
    on conflict (user_id, day) do update set calls = u.calls + 1
    returning calls into v_calls;
  exception when sqlstate 'P0001' then
    return jsonb_build_object('allowed', false, 'calls', v_limit, 'limit', v_limit);
  end;
  return jsonb_build_object('allowed', true, 'calls', v_calls, 'limit', v_limit);
end $$;
