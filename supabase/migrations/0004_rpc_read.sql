-- devloop — 0004: read RPCs. They return jsonb shaped exactly like src/lib/api/contract.ts
-- (camelCase), so the client does no remapping. SECURITY INVOKER unless stated: RLS applies.

-- ---------------------------------------------------------------- JSON shaping helpers (schema private)
create or replace function private.clamp(p integer, p_default integer, p_max integer)
returns integer language sql immutable
set search_path = ''
as $$ select least(greatest(coalesce(p, p_default), 1), p_max) $$;

create or replace function private.interest_json(i public.interests)
returns jsonb language sql immutable
set search_path = ''
as $$ select jsonb_build_object('id', i.id, 'slug', i.slug, 'labelFr', i.label_fr, 'labelEn', i.label_en) $$;

create or replace function private.author_json(p public.profiles)
returns jsonb language sql immutable
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'handle', p.handle::text, 'displayName', p.display_name,
    'avatarUrl', p.avatar_url, 'level', p.level, 'reputation', p.reputation)
$$;

create or replace function private.profile_json(p public.profiles)
returns jsonb language sql immutable
set search_path = ''
as $$
  select private.author_json(p) || jsonb_build_object('bio', p.bio, 'githubLogin', p.github_login,
    'locale', p.locale, 'isGuest', p.is_guest, 'onboarded', p.onboarded, 'createdAt', p.created_at)
$$;

-- One row per requested post, contract `Post` shape (without reasons/score/similarity).
create or replace function private.posts_json(p_ids uuid[])
returns table (id uuid, j jsonb) language sql stable
set search_path = ''
as $$
  select p.id, jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'title', p.title, 'bodyMd', p.body_md, 'code', p.code,
    'language', p.language, 'repro', p.repro, 'difficulty', p.difficulty,
    'aiSummary', p.ai_summary, 'aiHints', to_jsonb(p.ai_hints), 'status', p.status,
    'acceptedAnswerId', p.accepted_answer_id,
    'author', private.author_json(a),
    'circle', case when c.id is null then null
                   else jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name) end,
    'tags', coalesce((select jsonb_agg(private.interest_json(i) order by i.id)
                      from public.post_tags t join public.interests i on i.id = t.interest_id
                      where t.post_id = p.id), '[]'::jsonb),
    'helpfulCount', p.helpful_count, 'answerCount', p.answer_count, 'viewCount', p.view_count,
    'createdAt', p.created_at,
    'viewer', jsonb_build_object(
      'helpful', exists (select 1 from public.votes v where v.user_id = (select auth.uid())
                         and v.target_type = 'post' and v.target_id = p.id),
      'saved', exists (select 1 from public.saves s where s.user_id = (select auth.uid()) and s.post_id = p.id)))
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.circles c on c.id = p.circle_id
  where p.id = any (p_ids)
$$;

-- Contract `Page<Post>` from up to p_limit + 1 ordered ids.
create or replace function private.posts_page(p_ids uuid[], p_limit integer, p_offset integer)
returns jsonb language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(pj.j order by array_position(p_ids, pj.id))
                       from private.posts_json(p_ids[1:p_limit]) pj), '[]'::jsonb),
    'nextCursor', case when coalesce(array_length(p_ids, 1), 0) > p_limit then (p_offset + p_limit)::text end)
$$;

create or replace function private.answers_json(p_ids uuid[])
returns table (id uuid, j jsonb) language sql stable
set search_path = ''
as $$
  select a.id, jsonb_build_object(
    'id', a.id, 'postId', a.post_id, 'author', private.author_json(pr), 'bodyMd', a.body_md,
    'repro', a.repro, 'isAi', a.is_ai, 'isAccepted', a.is_accepted, 'helpfulCount', a.helpful_count,
    'createdAt', a.created_at,
    'viewer', jsonb_build_object('helpful', exists (select 1 from public.votes v
       where v.user_id = (select auth.uid()) and v.target_type = 'answer' and v.target_id = a.id)))
  from public.answers a join public.profiles pr on pr.id = a.author_id
  where a.id = any (p_ids)
$$;

create or replace function private.circle_json(c public.circles)
returns jsonb language sql stable
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name,
    'descriptionFr', c.description_fr, 'descriptionEn', c.description_en,
    'interest', (select private.interest_json(i) from public.interests i where i.id = c.interest_id),
    'externalInviteUrl', c.external_invite_url,
    'memberCount', (select count(*) from public.circle_members m where m.circle_id = c.id),
    'postCount', (select count(*) from public.posts p where p.circle_id = c.id),
    'viewer', jsonb_build_object('isMember', exists (select 1 from public.circle_members m
       where m.circle_id = c.id and m.user_id = (select auth.uid()))))
$$;

create or replace function private.message_json(m public.messages)
returns jsonb language sql stable
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'circleId', m.circle_id,
    'author', (select private.author_json(p) from public.profiles p where p.id = m.author_id),
    'body', m.body, 'createdAt', m.created_at)
$$;

create or replace function private.notification_json(n public.notifications)
returns jsonb language sql stable
set search_path = ''
as $$
  select jsonb_build_object('id', n.id, 'type', n.type,
    'actor', (select private.author_json(p) from public.profiles p where p.id = n.actor_id),
    'postId', n.post_id,
    'postTitle', (select p.title from public.posts p where p.id = n.post_id),
    'read', n.read, 'createdAt', n.created_at)
$$;

-- ---------------------------------------------------------------- interests
create or replace function public.list_interests()
returns jsonb language sql stable
set search_path = ''
as $$ select coalesce(jsonb_agg(private.interest_json(i) order by i.id), '[]'::jsonb) from public.interests i $$;

-- UserInterest[]: effective weight (decay applied), strongest first.
create or replace function public.my_interests()
returns jsonb language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'interest', private.interest_json(i),
      'weight', round(private.eff_weight(ui.weight, ui.updated_at)::numeric, 3),
      'muted', ui.muted, 'source', ui.source,
      'recentOpens', (select count(distinct e.post_id) from public.events e
                      join public.post_tags t on t.post_id = e.post_id
                      where e.user_id = ui.user_id and e.type = 'open'
                        and e.created_at > now() - interval '14 days' and t.interest_id = ui.interest_id))
    order by private.eff_weight(ui.weight, ui.updated_at) desc, i.id), '[]'::jsonb)
  from public.user_interests ui join public.interests i on i.id = ui.interest_id
  where ui.user_id = private.uid()
$$;

-- ---------------------------------------------------------------- profiles
create or replace function public.my_profile()
returns jsonb language sql stable
set search_path = ''
as $$ select private.profile_json(p) from public.profiles p where p.id = (select auth.uid()) $$;

create or replace function public.profile_stats(p_user_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  with a as (
    select count(*) as given,
           count(*) filter (where an.is_accepted and p.author_id <> an.author_id) as accepted,
           count(*) filter (where an.is_accepted and p.author_id <> an.author_id
                            and coalesce(an.accepted_at, an.created_at) > now() - interval '7 days') as week,
           coalesce(sum(an.helpful_count), 0) as helpful
    from public.answers an join public.posts p on p.id = an.post_id
    where an.author_id = p_user_id
  ), q as (
    select count(*) filter (where kind = 'problem') as asked,
           count(*) filter (where kind = 'problem' and status = 'solved') as solved,
           coalesce(sum(helpful_count), 0) as helpful
    from public.posts where author_id = p_user_id
  )
  select jsonb_build_object(
    'unblockedThisWeek', a.week, 'unblockedTotal', a.accepted,
    'problemsAsked', q.asked, 'problemsSolved', q.solved, 'answersGiven', a.given,
    'helpfulReceived', a.helpful + q.helpful,
    'unblockRate', case when a.given = 0 then 0 else round(a.accepted::numeric / a.given, 3) end,
    'followers', (select count(*) from public.follows f where f.followee_id = p_user_id),
    'following', (select count(*) from public.follows f where f.follower_id = p_user_id))
  from a, q
$$;

-- ProfileDetail. DEFINER because it lists another member's topics (labels only, never
-- weights) from the owner-only table user_interests.
create or replace function public.get_profile(p_handle text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.uid();
  v_p   public.profiles;
begin
  select * into v_p from public.profiles p where p.handle::text = lower(btrim(coalesce(p_handle, '')));
  if not found then
    raise exception 'not_found: profile' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'profile', private.profile_json(v_p),
    'stats', public.profile_stats(v_p.id),
    'interests', coalesce((select jsonb_agg(private.interest_json(i) order by ui.weight desc, i.id)
                           from public.user_interests ui join public.interests i on i.id = ui.interest_id
                           where ui.user_id = v_p.id and not ui.muted and ui.weight >= 0.15), '[]'::jsonb),
    'viewer', jsonb_build_object('isSelf', v_p.id = v_uid,
      'isFollowing', exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = v_p.id)));
end $$;

-- Author[] worth following, ranked by shared interests. DEFINER (reads other members'
-- interests) but only the ranking leaves the function.
create or replace function public.people_suggestions(p_limit integer default 5)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare v_uid uuid := private.uid();
begin
  return coalesce((
    select jsonb_agg(s.j order by s.shared desc, s.reputation desc, s.id)
    from (
      select p.id, p.reputation, private.author_json(p) as j,
             coalesce((select sum(least(mine.weight, theirs.weight))
                       from public.user_interests mine
                       join public.user_interests theirs on theirs.interest_id = mine.interest_id
                       where mine.user_id = v_uid and theirs.user_id = p.id
                         and not mine.muted and not theirs.muted), 0) as shared
      from public.profiles p
      where p.id <> v_uid and not p.is_guest
        and not exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = p.id)
      order by shared desc, p.reputation desc, p.id
      limit private.clamp(p_limit, 5, 20)
    ) s), '[]'::jsonb);
end $$;

create or replace function public.search_people(p_query text, p_limit integer default 8)
returns jsonb language sql stable
set search_path = ''
as $$
  with q as (
    select public.f_unaccent(lower(btrim(left(coalesce(p_query, ''), 60)))) as raw
  ), qq as (
    select raw, replace(replace(replace(raw, '\', '\\'), '%', '\%'), '_', '\_') as esc from q
  ), hits as (
    select p, p.reputation, p.id,
           extensions.similarity(public.f_unaccent(lower(p.display_name)), qq.raw) as sim,
           (p.handle::text = qq.raw) as exact
    from public.profiles p, qq
    where qq.raw <> '' and private.uid() is not null
      and (p.handle::text like qq.esc || '%'
           or public.f_unaccent(lower(p.display_name)) like '%' || qq.esc || '%'
           or extensions.similarity(public.f_unaccent(lower(p.display_name)), qq.raw) > 0.35)
    order by exact desc, sim desc, p.reputation desc, p.id
    limit private.clamp(p_limit, 8, 30)
  )
  select coalesce(jsonb_agg(private.author_json(h.p) order by h.exact desc, h.sim desc, h.reputation desc, h.id), '[]'::jsonb)
  from hits h
$$;

-- Landing-page counters. DEFINER and the ONLY function `anon` may call: four aggregate
-- integers, no rows.
create or replace function public.platform_stats()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'members', (select count(*) from public.profiles where not is_guest),
    'problems', (select count(*) from public.posts where kind = 'problem'),
    'solved', (select count(*) from public.posts where kind = 'problem' and status = 'solved'),
    'unblockedThisWeek', (select count(*) from public.answers a
                          where a.is_accepted and coalesce(a.accepted_at, a.created_at) > now() - interval '7 days'))
$$;

-- ---------------------------------------------------------------- posts & answers
create or replace function public.get_post(p_id uuid)
returns jsonb language plpgsql stable
set search_path = ''
as $$
declare v jsonb;
begin
  perform private.uid();
  select pj.j into v from private.posts_json(array[p_id]) pj;
  if v is null then
    raise exception 'not_found: post' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- Answer[]: accepted first, then most helpful, then oldest.
create or replace function public.list_answers(p_post_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(aj.j order by a.is_accepted desc, a.helpful_count desc, a.created_at, a.id), '[]'::jsonb)
  from public.answers a
  join private.answers_json(array(select x.id from public.answers x where x.post_id = p_post_id)) aj on aj.id = a.id
  where a.post_id = p_post_id and private.uid() is not null
$$;

create or replace function public.circle_posts(p_slug text, p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable
set search_path = ''
as $$
declare
  v_lim integer := private.clamp(p_limit, 20, 50);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_circle uuid;
begin
  perform private.uid();
  select c.id into v_circle from public.circles c where c.slug = p_slug;
  if v_circle is null then
    raise exception 'not_found: circle' using errcode = 'P0001';
  end if;
  return private.posts_page(array(
    select p.id from public.posts p where p.circle_id = v_circle
    order by p.created_at desc, p.id limit v_lim + 1 offset v_off), v_lim, v_off);
end $$;

create or replace function public.user_posts(p_user_id uuid, p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable
set search_path = ''
as $$
declare
  v_lim integer := private.clamp(p_limit, 20, 50);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform private.uid();
  return private.posts_page(array(
    select p.id from public.posts p where p.author_id = p_user_id
    order by p.created_at desc, p.id limit v_lim + 1 offset v_off), v_lim, v_off);
end $$;

create or replace function public.saved_posts(p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable
set search_path = ''
as $$
declare
  v_uid uuid := private.uid();
  v_lim integer := private.clamp(p_limit, 20, 50);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  return private.posts_page(array(
    select s.post_id from public.saves s where s.user_id = v_uid
    order by s.created_at desc, s.post_id limit v_lim + 1 offset v_off), v_lim, v_off);
end $$;

-- ---------------------------------------------------------------- search
-- Post[]. Full text on the accent-insensitive config (title A > tags B > body/code C) with
-- prefix matching on every word; all words first, then any word; solved problems get a
-- boost; when nothing matches, trigram similarity on the title catches typos.
create or replace function public.search_posts(p_query text, p_limit integer default 10, p_status text default null)
returns jsonb language plpgsql stable
set search_path = ''
as $$
declare
  v_lim   integer := private.clamp(p_limit, 10, 30);
  v_q     text := btrim(left(coalesce(p_query, ''), 200));
  v_norm  text;
  v_lex   text[];
  v_and   tsquery;
  v_or    tsquery;
  v_ids   uuid[];
begin
  perform private.uid();
  if p_status is not null and p_status not in ('open', 'solved') then
    raise exception 'validation: status must be open or solved' using errcode = 'P0001';
  end if;
  if v_q = '' then
    return '[]'::jsonb;
  end if;
  v_norm := public.f_unaccent(lower(v_q));
  select array_agg(x.lexeme) into v_lex
  from (select lexeme from unnest(to_tsvector('public.devloop_fts'::regconfig, v_q)) limit 12) x;

  if v_lex is not null then
    select to_tsquery('simple', string_agg('''' || replace(replace(l, '\', '\\'), '''', '''''') || ''':*', ' & ')),
           to_tsquery('simple', string_agg('''' || replace(replace(l, '\', '\\'), '''', '''''') || ''':*', ' | '))
      into v_and, v_or from unnest(v_lex) l;
    v_ids := array(
      select p.id from public.posts p
      where p.fts @@ v_or and (p_status is null or p.status = p_status)
      order by (p.fts @@ v_and) desc,
               ts_rank(p.fts, v_or) * (case when p.status = 'solved' then 1.3 else 1 end) desc,
               p.created_at desc, p.id
      limit v_lim);
  end if;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    v_ids := array(
      select p.id from public.posts p
      where extensions.word_similarity(v_norm, public.f_unaccent(lower(p.title))) >= 0.35
        and (p_status is null or p.status = p_status)
      order by extensions.word_similarity(v_norm, public.f_unaccent(lower(p.title))) desc,
               (p.status = 'solved') desc, p.created_at desc, p.id
      limit v_lim);
  end if;

  return coalesce((select jsonb_agg(pj.j order by array_position(v_ids, pj.id))
                   from private.posts_json(v_ids) pj), '[]'::jsonb);
end $$;

-- Post[] with `similarity`. Solved problems first, then by cosine similarity.
create or replace function public.match_posts(p_embedding extensions.vector, p_limit integer default 5,
                                              p_min_sim double precision default 0.5)
returns jsonb language plpgsql stable
set search_path = ''
as $$
declare
  v_lim integer := private.clamp(p_limit, 5, 20);
  v_ids uuid[];
  v_sim double precision[];
begin
  perform private.uid();
  if p_embedding is null or extensions.vector_dims(p_embedding) <> 384 then
    raise exception 'validation: embedding must have 384 dimensions' using errcode = 'P0001';
  end if;
  select array_agg(m.id order by m.solved desc, m.sim desc, m.id),
         array_agg(m.sim order by m.solved desc, m.sim desc, m.id)
    into v_ids, v_sim
  from (
    select p.id, (p.status = 'solved') as solved,
           1 - (p.embedding operator(extensions.<=>) p_embedding) as sim
    from public.posts p
    where p.embedding is not null
      and 1 - (p.embedding operator(extensions.<=>) p_embedding) >= coalesce(p_min_sim, 0.5)
    order by (p.status = 'solved') desc, p.embedding operator(extensions.<=>) p_embedding, p.id
    limit v_lim
  ) m;
  return coalesce((
    select jsonb_agg(pj.j || jsonb_build_object('similarity', round(v_sim[array_position(v_ids, pj.id)]::numeric, 4))
                     order by array_position(v_ids, pj.id))
    from private.posts_json(v_ids) pj), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- circles, chat, notifications
create or replace function public.list_circles()
returns jsonb language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.j order by (x.j -> 'viewer' ->> 'isMember')::boolean desc,
                            (x.j ->> 'memberCount')::integer desc, x.name), '[]'::jsonb)
  from (select c.name, private.circle_json(c) as j from public.circles c where private.uid() is not null) x
$$;

create or replace function public.get_circle(p_slug text)
returns jsonb language plpgsql stable
set search_path = ''
as $$
declare v jsonb;
begin
  perform private.uid();
  select private.circle_json(c) into v from public.circles c where c.slug = p_slug;
  if v is null then
    raise exception 'not_found: circle' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- ChatMessage[]: the last p_limit messages, oldest first.
create or replace function public.chat_history(p_circle_id uuid, p_limit integer default 50)
returns jsonb language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.message_json(x.m) order by x.created_at, x.id), '[]'::jsonb)
  from (select m, m.created_at, m.id from public.messages m
        where m.circle_id = p_circle_id and private.uid() is not null
        order by m.created_at desc, m.id desc limit private.clamp(p_limit, 50, 200)) x
$$;

-- Hydrates a realtime payload (the row has no author details).
create or replace function public.get_message(p_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$ select private.message_json(m) from public.messages m where m.id = p_id and private.uid() is not null $$;

create or replace function public.list_notifications(p_limit integer default 30)
returns jsonb language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.notification_json(x.n) order by x.created_at desc, x.id), '[]'::jsonb)
  from (select n, n.created_at, n.id from public.notifications n
        where n.user_id = private.uid()
        order by n.created_at desc, n.id limit private.clamp(p_limit, 30, 100)) x
$$;

create or replace function public.get_notification(p_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  select private.notification_json(n) from public.notifications n
  where n.id = p_id and n.user_id = private.uid()
$$;
