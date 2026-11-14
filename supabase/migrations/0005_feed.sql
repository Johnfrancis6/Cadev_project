-- devloop — 0005: the explainable, steerable feed (SPEC §6 "Feed scoring").
-- SECURITY INVOKER: it only ever reads the caller's own interests/events/follows.
--
--   score = 3.0 * Σ effective weight(tag)           (posts carrying a muted tag are dropped)
--         + 1.5 * exp(-age_hours / 72)
--         + 0.8 * ln(1 + helpful_count + 2 * solved)
--         + 1.0 * level_match                       (1 same, 0.5 adjacent, 0 otherwise)
--         + 0.6 * author followed
--
-- for-you: every 8th slot is an exploration slot = the best post whose topics all weigh
-- < 0.15 for the viewer. Own posts, muted topics and posts the viewer dismissed ("less")
-- are excluded. Deterministic for a given state (ties: newest, then id).
-- Returns contract Page<Post> with `score` and at most 2 `reasons` per post.

create or replace function public.feed_for_user(
  p_tab text default 'for-you', p_limit integer default 20, p_offset integer default 0, p_interest text default null)
returns jsonb language plpgsql stable
set search_path = ''
as $$
declare
  v_uid      uuid := private.uid();
  v_lim      integer := private.clamp(p_limit, 20, 50);
  v_off      integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
  v_tab      text := coalesce(p_tab, 'for-you');
  v_rank     integer;
  v_interest smallint;
  v_items    jsonb;
  v_count    integer;
begin
  if v_tab not in ('for-you', 'following', 'unanswered', 'latest') then
    raise exception 'validation: unknown feed tab' using errcode = 'P0001';
  end if;
  select private.level_rank(p.level) into v_rank from public.profiles p where p.id = v_uid;
  v_rank := coalesce(v_rank, 1);
  if p_interest is not null and p_interest <> '' then
    select i.id into v_interest from public.interests i where i.slug = p_interest;
    if v_interest is null then
      return jsonb_build_object('items', '[]'::jsonb, 'nextCursor', null);
    end if;
  end if;

  with w as (
    select ui.interest_id, ui.muted, private.eff_weight(ui.weight, ui.updated_at) as w
    from public.user_interests ui where ui.user_id = v_uid
  ), opens as (
    select t.interest_id, count(distinct e.post_id) as c
    from public.events e join public.post_tags t on t.post_id = e.post_id
    where e.user_id = v_uid and e.type = 'open' and e.created_at > now() - interval '14 days'
    group by t.interest_id
  ), tagagg as (
    select t.post_id,
           coalesce(sum(w.w) filter (where not w.muted), 0) as wsum,
           coalesce(max(w.w) filter (where not w.muted), 0) as wmax,
           coalesce(bool_or(w.muted), false) as has_muted,
           coalesce(bool_or(t.interest_id = v_interest), false) as has_interest,
           (array_agg(t.interest_id order by w.w desc, t.interest_id)
              filter (where w.w >= 0.15 and not w.muted))[1] as top_interest,
           min(t.interest_id) as first_interest
    from public.post_tags t left join w on w.interest_id = t.interest_id
    group by t.post_id
  ), trending as (
    select distinct on (x.circle_id) x.id
    from (
      select p.id, p.circle_id, p.created_at,
             (select count(*) from public.answers a where a.post_id = p.id and a.created_at > now() - interval '48 hours')
             + case when p.created_at > now() - interval '48 hours' then p.helpful_count else 0 end as activity
      from public.posts p where p.circle_id is not null
    ) x
    where x.activity > 0
    order by x.circle_id, x.activity desc, x.created_at desc, x.id
  ), cand as (
    select p.id, p.created_at, p.circle_id, p.kind, p.status, p.answer_count,
           private.level_rank(p.difficulty) as dr,
           coalesce(ta.wmax, 0) as wmax, ta.top_interest, ta.first_interest,
           f.follower_id is not null as followed,
           3.0 * coalesce(ta.wsum, 0)
           + 1.5 * exp(-(extract(epoch from (now() - p.created_at)) / 3600.0) / 72.0)
           + 0.8 * ln(1 + p.helpful_count + case when p.status = 'solved' then 2 else 0 end)
           + 1.0 * (case abs(private.level_rank(p.difficulty) - v_rank) when 0 then 1.0 when 1 then 0.5 else 0 end)
           + 0.6 * (case when f.follower_id is not null then 1 else 0 end) as score
    from public.posts p
    left join tagagg ta on ta.post_id = p.id
    left join public.follows f on f.follower_id = v_uid and f.followee_id = p.author_id
    where (v_interest is null or coalesce(ta.has_interest, false))
      and case v_tab
            when 'for-you' then p.author_id <> v_uid and not coalesce(ta.has_muted, false)
                 and not exists (select 1 from public.events e
                                 where e.user_id = v_uid and e.post_id = p.id and e.type = 'less')
            when 'following' then f.follower_id is not null
            when 'unanswered' then p.kind = 'problem' and p.status = 'open' and p.answer_count = 0
                 and p.author_id <> v_uid and not coalesce(ta.has_muted, false)
            else true
          end
  ), expl as (
    select c.id, row_number() over (order by c.score desc, c.created_at desc, c.id) as rn
    from cand c
    where v_tab = 'for-you' and v_interest is null and c.wmax < 0.15
  ), k as (
    select least((select count(*) from expl), (select count(*) from cand) / 8) as k
  ), main as (
    select c.id, row_number() over (order by
             case when v_tab = 'unanswered' then (case when c.dr <= v_rank then 0 else 1 end) end,
             case when v_tab = 'unanswered' then (case when c.dr <= v_rank then -c.dr else c.dr end) end,
             case when v_tab = 'for-you' then c.score end desc nulls last,
             c.created_at desc, c.id) as r
    from cand c
    where not exists (select 1 from expl e, k where e.id = c.id and e.rn <= k.k)
  ), placed as (
    select m.id, (m.r + least((m.r - 1) / 7, k.k))::integer as pos, false as explore from main m, k
    union all
    select e.id, (8 * e.rn)::integer, true from expl e, k where e.rn <= k.k
  ), page as (
    select pl.id, pl.pos, pl.explore from placed pl
    where pl.pos > v_off and pl.pos <= v_off + v_lim + 1
  )
  select count(*),
         coalesce(jsonb_agg(
           pj.j || jsonb_build_object(
             'score', round(c.score::numeric, 4),
             'reasons', coalesce((
               select jsonb_agg(z.r order by z.ord)
               from (
                 select v.ord, v.r
                 from (values
                   (1, case when c.followed then jsonb_build_object('kind', 'following') end),
                   (2, case when c.top_interest is not null then jsonb_build_object('kind', 'interest',
                          'interestSlug', (select i.slug from public.interests i where i.id = c.top_interest),
                          'count', coalesce((select o.c from opens o where o.interest_id = c.top_interest), 0)) end),
                   (3, case when pg.explore then jsonb_strip_nulls(jsonb_build_object('kind', 'explore',
                          'interestSlug', (select i.slug from public.interests i where i.id = c.first_interest))) end),
                   (4, case when exists (select 1 from trending t where t.id = c.id) then jsonb_build_object('kind', 'trending',
                          'circleSlug', (select ci.slug from public.circles ci where ci.id = c.circle_id)) end),
                   (5, case when c.dr = v_rank then jsonb_build_object('kind', 'level') end),
                   (6, case when c.kind = 'problem' and c.status = 'open' and c.answer_count = 0
                            then jsonb_build_object('kind', 'unanswered') end),
                   (7, case when c.created_at > now() - interval '6 hours' then jsonb_build_object('kind', 'fresh') end)
                 ) v (ord, r)
                 where v.r is not null
                 order by v.ord limit 2
               ) z), '[]'::jsonb))
           order by pg.pos) filter (where pg.pos <= v_off + v_lim), '[]'::jsonb)
    into v_count, v_items
  from page pg
  join cand c on c.id = pg.id
  join private.posts_json(array(select id from page)) pj on pj.id = pg.id;

  return jsonb_build_object('items', v_items,
    'nextCursor', case when v_count > v_lim then (v_off + v_lim)::text end);
end $$;
