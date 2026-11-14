-- devloop — automated security + behaviour test for the database.
--
-- Runs as an admin role (postgres) on a local database or on the live project:
--   local : scripts/test-db.sh                       (psql)
--   live  : node scripts/supabase-admin.mjs test <ref>   (Management API, chunk by chunk)
--
-- Chunk 1 installs a throw-away `tests` schema. Chunk 2 runs every check inside ONE
-- sub-transaction that is always rolled back, so no test user or row survives — it is safe
-- on a database with real data. Chunk 3 removes the schema. Each check yields PASS/FAIL.
-- Users are impersonated exactly like PostgREST does: `set local role` + request.jwt.claims.

drop schema if exists tests cascade;
create schema tests;
revoke all on schema tests from public;

-- Runs one statement as an API role. Returns 'ok:<first column of first row>' or
-- 'err:<sqlstate>:<message>'. A failing statement is rolled back on its own.
create or replace function tests.run_as(p_uid uuid, p_sql text, p_role text default 'authenticated')
returns text language plpgsql
set search_path = ''
as $$
declare
  v   text;
  res text;
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then jsonb_build_object('role', p_role)
         else jsonb_build_object('sub', p_uid, 'role', p_role, 'aud', 'authenticated') end::text, true);
  execute format('set local role %I', p_role);
  begin
    if p_sql ~* '^\s*(select|with)\M' then
      execute p_sql into v;
    else
      execute p_sql;
    end if;
    set constraints all immediate;   -- surface deferred checks (1–5 tags) now
    set constraints all deferred;
    res := 'ok:' || coalesce(v, '');
  exception when others then
    res := 'err:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;

create or replace function tests.chk(p_name text, p_actual text, p_like text)
returns jsonb language sql immutable
set search_path = ''
as $$
  select jsonb_build_object('name', p_name, 'pass', coalesce(p_actual like p_like, false),
    'detail', case when coalesce(p_actual like p_like, false) then ''
                   else 'expected ' || p_like || ' — got ' || left(coalesce(p_actual, '<null>'), 220) end)
$$;

-- 384-d vector with the first two components set.
create or replace function tests.vec(a double precision, b double precision)
returns extensions.vector language sql immutable
set search_path = ''
as $$
  select ('[' || a::text || ',' || b::text || repeat(',0', 382) || ']')::extensions.vector
$$;

create or replace function tests.new_user(p_id uuid, p_email text, p_meta jsonb, p_anonymous boolean default false)
returns void language sql
set search_path = ''
as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, '',
    now(), jsonb_build_object('provider', case when p_anonymous then 'anonymous' else 'email' end, 'devloop_test', true),
    p_meta, now(), now(), p_anonymous)
$$;

-- Rank (1-based) of a post in the caller's for-you feed, scanning up to 1 000 slots.
create or replace function tests.feed_rank_sql(p_post uuid)
returns text language sql immutable
set search_path = ''
as $$
  select format($f$
    select min(z.pos) from (
      select o + t.ord as pos, t.i ->> 'id' as id
      from generate_series(0, 950, 50) o,
           lateral jsonb_array_elements(public.feed_for_user('for-you', 50, o, null) -> 'items') with ordinality t (i, ord)
    ) z where z.id = %L $f$, p_post)
$$;

create or replace function tests.run_all()
returns table (ord integer, result text, name text, detail text) language plpgsql
set search_path = ''
as $$
declare
  res jsonb := '[]'::jsonb;
  a   uuid := 'aaaaaaaa-0000-4000-8000-00000000000a';   -- member A
  b   uuid := 'bbbbbbbb-0000-4000-8000-00000000000b';   -- member B
  g   uuid := 'cccccccc-0000-4000-8000-00000000000c';   -- guest
  go_id smallint; react_id smallint;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; pa uuid; pq uuid;
  ans_a uuid; ans_b uuid; circle uuid := 'dddddddd-0000-4000-8000-00000000000d';
  r text; r2 text; n1 integer; n2 integer; t0 timestamptz; ms integer; j jsonb; i integer;
  post_keys text := 'acceptedAnswerId,aiHints,aiSummary,answerCount,author,bodyMd,circle,code,createdAt,difficulty,helpfulCount,id,kind,language,repro,status,tags,title,viewCount,viewer';
begin
  begin
    select id into go_id from public.interests where slug = 'go';
    select id into react_id from public.interests where slug = 'react';

    -- ============================================================ sign-up trigger
    perform tests.new_user(a, 'a@test.devloop.invalid', '{"display_name": "Élodie  Test"}');
    perform tests.new_user(b, 'b@test.devloop.invalid', '{"full_name": "Bob Test", "avatar_url": "javascript:alert(1)"}');
    perform tests.new_user(g, null, '{}', true);
    res := res || tests.chk('sign-up creates a profile from display_name',
      (select display_name || '|' || (handle::text ~ '^[a-z0-9_]{3,24}$') || '|' || is_guest from public.profiles where id = a), 'Élodie Test|true|false');
    update public.profiles set handle = 'test_user_a' where id = a;
    res := res || tests.chk('sign-up falls back to full_name and rejects a non-https avatar',
      (select display_name || '|' || coalesce(avatar_url, 'null') from public.profiles where id = b), 'Bob Test|null');
    res := res || tests.chk('anonymous sign-in gives a guest profile "Invité NNNN"',
      (select (display_name ~ '^Invité [0-9]{4}$')::text || '|' || is_guest || '|' || (handle::text ~ '^[a-z0-9_]{3,24}$')
       from public.profiles where id = g), 'true|true|true');
    insert into public.circles (id, slug, name) values (circle, 'zz-test-circle', 'Test circle');

    -- ============================================================ onboarding + content (as users)
    res := res || tests.chk('complete_onboarding returns the onboarded Profile',
      tests.run_as(a, $q$ select (public.complete_onboarding('senior', array['react'], 'Élodie Test'))::text $q$),
      'ok:%"onboarded": true%');
    res := res || tests.chk('my_interests: react at 0.6 from onboarding',
      tests.run_as(a, $q$ select (public.my_interests() -> 0 ->> 'weight') || '|' || (public.my_interests() -> 0 -> 'interest' ->> 'slug')
                            || '|' || (public.my_interests() -> 0 ->> 'source') || '|' || (public.my_interests() -> 0 ->> 'recentOpens') $q$),
      'ok:0.600|react|onboarding|0');

    r := tests.run_as(b, $q$ select public.create_post('{"kind":"problem","title":"Goroutine leak zzqx one","bodyMd":"body","tags":["go"],"difficulty":"senior"}') ->> 'id' $q$);
    res := res || tests.chk('create_post works and returns the Post', r, 'ok:________-%');
    p1 := substr(r, 4)::uuid;
    p2 := substr(tests.run_as(b, $q$ select public.create_post('{"kind":"problem","title":"Goroutine leak zzqx two","bodyMd":"body","tags":["go"],"difficulty":"senior"}') ->> 'id' $q$), 4)::uuid;
    p3 := substr(tests.run_as(b, $q$ select public.create_post('{"kind":"problem","title":"Goroutine leak zzqx three","bodyMd":"body","tags":["go"],"difficulty":"senior"}') ->> 'id' $q$), 4)::uuid;
    p4 := substr(tests.run_as(b, $q$ select public.create_post('{"kind":"problem","title":"React effect zzqx loops forever","bodyMd":"body","code":"useEffect(() => {})","language":"tsx","repro":{"html":"<p></p>","css":"","js":""},"tags":["react","javascript"],"difficulty":"senior","aiHints":["hint"]}') ->> 'id' $q$), 4)::uuid;
    pq := substr(tests.run_as(b, $q$ select public.create_post('{"kind":"problem","title":"Requête SQL zzqx trop lente","bodyMd":"La jointure est très lente","tags":["databases"],"difficulty":"beginner"}') ->> 'id' $q$), 4)::uuid;
    pa := substr(tests.run_as(a, $q$ select public.create_post('{"kind":"problem","title":"Own post of member A zzqx","bodyMd":"body","tags":["css"],"difficulty":"senior"}') ->> 'id' $q$), 4)::uuid;
    res := res || tests.chk('guests can post too',
      tests.run_as(g, $q$ select public.create_post('{"kind":"discussion","title":"Guest post zzqx hello","bodyMd":"","tags":["career"],"difficulty":"beginner"}') ->> 'kind' $q$), 'ok:discussion');
    res := res || tests.chk('Post JSON has exactly the contract keys',
      tests.run_as(a, format($q$ select string_agg(k, ',' order by k) from jsonb_object_keys(public.get_post(%L)) k $q$, p4)), 'ok:' || post_keys);
    res := res || tests.chk('Post JSON nests author, tags, repro and viewer',
      tests.run_as(a, format($q$ select (x -> 'author' ->> 'displayName') || '|' || jsonb_array_length(x -> 'tags') || '|' || (x -> 'tags' -> 0 ->> 'labelFr')
        || '|' || (x -> 'repro' ->> 'html') || '|' || (x -> 'viewer')::text || '|' || (x ->> 'circle' is null) from public.get_post(%L) x $q$, p4)),
      'ok:Bob Test|2|JavaScript|<p></p>|{"saved": false, "helpful": false}|true');
    res := res || tests.chk('search vector is maintained (title + tags)',
      (select (fts @@ to_tsquery('simple', 'react & javascript & loops'))::text from public.posts where id = p4), 'true');

    -- ============================================================ feed
    t0 := clock_timestamp();
    r := tests.run_as(a, $q$ select public.feed_for_user('for-you', 20, 0, null)::text $q$);
    ms := (extract(epoch from clock_timestamp() - t0) * 1000)::integer;
    res := res || tests.chk('feed_for_user returns a page', r, 'ok:{"items": [{%');
    res := res || tests.chk('feed_for_user answers in well under 200 ms (' || ms || ' ms)', (ms < 200)::text, 'true');
    j := substr(r, 4)::jsonb;
    res := res || tests.chk('every feed card has a score and at most 2 reasons',
      (select (max(jsonb_array_length(x -> 'reasons')) <= 2 and bool_and(x ? 'score') and bool_and(jsonb_array_length(x -> 'reasons') >= 0))::text
       from jsonb_array_elements(j -> 'items') x), 'true');
    res := res || tests.chk('feed is deterministic for a given state',
      (r = tests.run_as(a, $q$ select public.feed_for_user('for-you', 20, 0, null)::text $q$))::text, 'true');
    res := res || tests.chk('for-you never shows your own posts',
      tests.run_as(a, tests.feed_rank_sql(pa)), 'ok:');
    res := res || tests.chk('for-you ranks a matching interest first with reason "interest"',
      tests.run_as(a, format($q$ select (x ->> 'id') || '|' || (x -> 'reasons' -> 0 ->> 'kind') || '|' || (x -> 'reasons' -> 0 ->> 'interestSlug')
        from jsonb_array_elements(public.feed_for_user('for-you', 50, 0, 'react') -> 'items') x where x ->> 'id' = %L $q$, p4)),
      'ok:' || p4 || '|interest|react');
    res := res || tests.chk('every 8th slot is an exploration slot (reason "explore")',
      tests.run_as(a, $q$ select coalesce(bool_and(x.i -> 'reasons' @> '[{"kind":"explore"}]') filter (where x.ord % 8 = 0), true)
          and not coalesce(bool_or(x.i -> 'reasons' @> '[{"kind":"explore"}]') filter (where x.ord % 8 <> 0), false)
        from jsonb_array_elements(public.feed_for_user('for-you', 16, 0, null) -> 'items') with ordinality x (i, ord) $q$), 'ok:true');
    res := res || tests.chk('pagination: page 2 continues page 1 without overlap',
      tests.run_as(a, $q$ with p1 as (select public.feed_for_user('latest', 3, 0, null) f), p2 as (select public.feed_for_user('latest', 3, 3, null) f),
          big as (select public.feed_for_user('latest', 6, 0, null) f)
        select ((select jsonb_agg(x -> 'id') from p1, jsonb_array_elements(p1.f -> 'items') x)
             || (select jsonb_agg(x -> 'id') from p2, jsonb_array_elements(p2.f -> 'items') x)
             = (select jsonb_agg(x -> 'id') from big, jsonb_array_elements(big.f -> 'items') x))::text
          || '|' || (select p1.f ->> 'nextCursor' from p1) $q$), 'ok:true|3');
    res := res || tests.chk('tab "unanswered" only lists open problems without answers',
      tests.run_as(a, $q$ select coalesce(bool_and(x ->> 'status' = 'open' and x ->> 'kind' = 'problem' and (x ->> 'answerCount')::int = 0), true)
        from jsonb_array_elements(public.feed_for_user('unanswered', 50, 0, null) -> 'items') x $q$), 'ok:true');
    res := res || tests.chk('tab "following" is empty when following nobody',
      tests.run_as(a, $q$ select jsonb_array_length(public.feed_for_user('following', 20, 0, null) -> 'items') $q$), 'ok:0');
    res := res || tests.chk('set_following then tab "following" lists that author with reason "following"',
      tests.run_as(a, format($q$ select public.set_following(%L, true) $q$, b)) || '|' ||
      tests.run_as(a, format($q$ select bool_and(x -> 'author' ->> 'id' = %L and x -> 'reasons' -> 0 ->> 'kind' = 'following')
            from jsonb_array_elements(public.feed_for_user('following', 20, 0, null) -> 'items') x $q$, b)), 'ok:|ok:true');
    res := res || tests.chk('follow notifies the followee',
      (select count(*)::text from public.notifications where user_id = b and type = 'follow' and actor_id = a), '1');
    perform tests.run_as(a, format($q$ select public.set_following(%L, false) $q$, b));
    res := res || tests.chk('unknown tab is a validation error',
      tests.run_as(a, $q$ select public.feed_for_user('nope', 20, 0, null) $q$), 'err:P0001:validation%');

    -- ============================================================ learning
    n1 := substr(tests.run_as(a, tests.feed_rank_sql(p3)), 4)::integer;
    r := tests.run_as(a, $q$ select string_agg(x ->> 'id', ',') from jsonb_array_elements(public.feed_for_user('for-you', 50, 0, null) -> 'items') x $q$);
    res := res || tests.chk('record_event(open) creates the interest with gain 0.08',
      tests.run_as(a, format($q$ select public.record_event(%L, 'open', null)::text $q$, p1)),
      'ok:{"applied": true, "interests": [{"slug": "go", "weight": 0.080}]}');
    res := res || tests.chk('replaying the same signal within the hour does not inflate the weight',
      tests.run_as(a, format($q$ select public.record_event(%L, 'open', null) ->> 'applied' $q$, p1)), 'ok:false');
    perform tests.run_as(a, format($q$ select public.record_event(%L, 'open', null) $q$, p2));
    perform tests.run_as(a, format($q$ select public.record_event(%L, 'open', null) $q$, p3));
    res := res || tests.chk('three opens on one topic raise its weight to 1 − 0.92³',
      tests.run_as(a, $q$ select (x ->> 'weight') || '|' || (x ->> 'source') || '|' || (x ->> 'recentOpens')
        from jsonb_array_elements(public.my_interests()) x where x -> 'interest' ->> 'slug' = 'go' $q$), 'ok:0.221|behavior|3');
    n2 := substr(tests.run_as(a, tests.feed_rank_sql(p3)), 4)::integer;
    res := res || tests.chk('… and the topic moves up in the feed (rank ' || coalesce(n1::text, '?') || ' → ' || coalesce(n2::text, '?') || ')',
      (n2 < n1)::text, 'true');
    res := res || tests.chk('… and the feed order changes',
      (r is distinct from tests.run_as(a, $q$ select string_agg(x ->> 'id', ',') from jsonb_array_elements(public.feed_for_user('for-you', 50, 0, null) -> 'items') x $q$))::text, 'true');
    res := res || tests.chk('… and the card explains itself: interest go, count 3',
      tests.run_as(a, format($q$ select (x -> 'reasons' -> 0)::text from jsonb_array_elements(public.feed_for_user('for-you', 50, 0, 'go') -> 'items') x where x ->> 'id' = %L $q$, p3)),
      'ok:{"kind": "interest", "count": 3, "interestSlug": "go"}');
    res := res || tests.chk('open increments view_count once', (select view_count::text from public.posts where id = p1), '1');
    res := res || tests.chk('"less" halves the weight of the post''s topics',
      tests.run_as(a, format($q$ select public.record_event(%L, 'less', null) -> 'interests' -> 0 ->> 'weight' $q$, p4)), 'ok:0.300');
    res := res || tests.chk('… and the dismissed post leaves the for-you feed',
      tests.run_as(a, tests.feed_rank_sql(p4)), 'ok:');
    res := res || tests.chk('muting a topic removes it from the feed',
      tests.run_as(a, format($q$ select public.set_interest_muted(%s, true) $q$, go_id)) || '|' ||
      tests.run_as(a, $q$ select count(*) from generate_series(0, 950, 50) o,
          lateral jsonb_array_elements(public.feed_for_user('for-you', 50, o, null) -> 'items') x
        where x -> 'tags' @> '[{"slug":"go"}]' $q$), 'ok:|ok:0');
    res := res || tests.chk('un-muting brings it back',
      tests.run_as(a, format($q$ select public.set_interest_muted(%s, false) $q$, go_id)) || '|' || tests.run_as(a, tests.feed_rank_sql(p1)), 'ok:|ok:_%');
    res := res || tests.chk('set_interest_weight is reflected by my_interests',
      tests.run_as(a, format($q$ select public.set_interest_weight(%s, 0.9::real) $q$, react_id)) || '|' ||
      tests.run_as(a, $q$ select x ->> 'weight' from jsonb_array_elements(public.my_interests()) x where x -> 'interest' ->> 'slug' = 'react' $q$), 'ok:|ok:0.900');
    res := res || tests.chk('set_interest_weight rejects values outside 0..1',
      tests.run_as(a, format($q$ select public.set_interest_weight(%s, 1.5::real) $q$, react_id)), 'err:P0001:validation%');
    res := res || tests.chk('save_interests upserts a set',
      tests.run_as(a, $q$ select public.save_interests('[{"slug":"python","weight":0.7,"source":"github"}]') $q$) || '|' ||
      tests.run_as(a, $q$ select x ->> 'source' from jsonb_array_elements(public.my_interests()) x where x -> 'interest' ->> 'slug' = 'python' $q$), 'ok:|ok:github');
    res := res || tests.chk('reset_learning forgets behaviour-only topics and keeps explicit ones',
      tests.run_as(a, $q$ select public.reset_learning() $q$) || '|' ||
      tests.run_as(a, $q$ select string_agg(x -> 'interest' ->> 'slug', ',' order by x -> 'interest' ->> 'slug') from jsonb_array_elements(public.my_interests()) x $q$), 'ok:|ok:python,react');

    -- ============================================================ search
    res := res || tests.chk('search without accents finds the accented title',
      tests.run_as(a, format($q$ select (x ->> 'id' = %L)::text from jsonb_array_elements(public.search_posts('requete zzqx lente', 5, null)) x limit 1 $q$, pq)), 'ok:true');
    res := res || tests.chk('search with accents finds it too',
      tests.run_as(a, format($q$ select (x ->> 'id' = %L)::text from jsonb_array_elements(public.search_posts('Requête zzqx', 5, null)) x limit 1 $q$, pq)), 'ok:true');
    res := res || tests.chk('search matches word prefixes (type-ahead)',
      tests.run_as(a, format($q$ select (x ->> 'id' = %L)::text from jsonb_array_elements(public.search_posts('requ zzq', 5, null)) x limit 1 $q$, pq)), 'ok:true');
    res := res || tests.chk('search matches tags',
      tests.run_as(a, format($q$ select bool_or(x ->> 'id' = %L)::text from jsonb_array_elements(public.search_posts('zzqx databases', 10, null)) x $q$, pq)), 'ok:true');
    res := res || tests.chk('search falls back to trigram similarity on typos',
      tests.run_as(a, format($q$ select bool_or(x ->> 'id' = %L)::text from jsonb_array_elements(public.search_posts('gorroutine leek zzqxx', 10, null)) x $q$, p1)), 'ok:true');
    res := res || tests.chk('search with status filter excludes open problems',
      tests.run_as(a, $q$ select count(*) from jsonb_array_elements(public.search_posts('zzqx', 10, 'solved')) x $q$), 'ok:0');
    res := res || tests.chk('search tolerates tsquery metacharacters',
      tests.run_as(a, $q$ select jsonb_typeof(public.search_posts($x$ ' & | ! ( ) :* <-> \ "foo $x$, 5, null)) $q$), 'ok:array');
    res := res || tests.chk('search_people finds a member by name, accent-insensitive',
      tests.run_as(b, $q$ select public.search_people('elodie', 5) -> 0 ->> 'handle' $q$), 'ok:test_user_a');

    update public.posts set embedding = tests.vec(1, 0) where id = p1;
    update public.posts set embedding = tests.vec(0.7071, 0.7071) where id = p2;
    update public.posts set embedding = tests.vec(0, 1) where id = p3;
    res := res || tests.chk('match_posts orders by cosine similarity and applies the threshold',
      tests.run_as(a, format($q$ select string_agg((x ->> 'id') || '=' || (x ->> 'similarity'), ',') from jsonb_array_elements(public.match_posts(%L::extensions.vector, 5, 0.5)) x
        where x ->> 'id' in (%L, %L, %L) $q$, tests.vec(1, 0)::text, p1, p2, p3)),
      'ok:' || p1 || '=1.0000,' || p2 || '=0.7071');
    res := res || tests.chk('match_posts rejects a vector of the wrong size',
      tests.run_as(a, $q$ select public.match_posts('[1,2,3]'::extensions.vector, 5, 0.5) $q$), 'err:P0001:validation%');

    -- ============================================================ answers, helpful, accept
    r := tests.run_as(a, format($q$ select public.create_answer(%L, '{"bodyMd":"Close the channel.","isAi":false}') ->> 'id' $q$, p1));
    res := res || tests.chk('create_answer returns the Answer', r, 'ok:________-%');
    ans_a := substr(r, 4)::uuid;
    ans_b := substr(tests.run_as(b, format($q$ select public.create_answer(%L, '{"bodyMd":"Answering my own post."}') ->> 'id' $q$, p1)), 4)::uuid;
    res := res || tests.chk('an answer bumps answer_count and notifies the post author (never yourself)',
      (select answer_count::text from public.posts where id = p1) || '|'
      || (select count(*)::text from public.notifications where user_id = b and type = 'answer' and actor_id = a) || '|'
      || (select count(*)::text from public.notifications where user_id = b and actor_id = b), '2|1|0');
    res := res || tests.chk('list_answers returns contract-shaped answers',
      tests.run_as(b, format($q$ select jsonb_array_length(x) || '|' || (select string_agg(k, ',' order by k) from jsonb_object_keys(x -> 0) k) from public.list_answers(%L) x $q$, p1)),
      'ok:2|author,bodyMd,createdAt,helpfulCount,id,isAccepted,isAi,postId,repro,viewer');
    r := tests.run_as(b, format($q$ select public.set_helpful('answer', %L, true)::text $q$, ans_a));
    res := res || tests.chk('set_helpful: counter +1, author reputation +2, notification',
      r || '|'
      || (select reputation::text from public.profiles where id = a) || '|'
      || (select count(*)::text from public.notifications where user_id = a and type = 'helpful'), 'ok:{"on": true, "helpfulCount": 1}|2|1');
    res := res || tests.chk('set_helpful is idempotent',
      tests.run_as(b, format($q$ select public.set_helpful('answer', %L, true) ->> 'helpfulCount' $q$, ans_a)), 'ok:1');
    r := tests.run_as(a, format($q$ select public.set_helpful('answer', %L, true) ->> 'helpfulCount' $q$, ans_a));
    res := res || tests.chk('helpful on your own content counts but earns no reputation',
      r || '|'
      || (select reputation::text from public.profiles where id = a), 'ok:2|2');
    r := tests.run_as(b, format($q$ select public.set_helpful('answer', %L, false) ->> 'helpfulCount' $q$, ans_a));
    res := res || tests.chk('removing helpful undoes counter and reputation',
      r || '|'
      || (select reputation::text from public.profiles where id = a), 'ok:1|0');
    res := res || tests.chk('SECURITY: only the post author can accept an answer',
      tests.run_as(a, format($q$ select public.accept_answer(%L) $q$, ans_a)), 'err:P0001:forbidden%');
    r := tests.run_as(b, format($q$ select public.accept_answer(%L)::text $q$, ans_a));
    res := res || tests.chk('accept_answer: post solved, +15 reputation, notification',
      r || '|'
      || (select status || '|' || (accepted_answer_id = ans_a) from public.posts where id = p1) || '|'
      || (select reputation::text from public.profiles where id = a) || '|'
      || (select count(*)::text from public.notifications where user_id = a and type = 'accepted'),
      'ok:{"status": "solved", "acceptedAnswerId": "' || ans_a || '"}|solved|true|15|1');
    res := res || tests.chk('match_posts puts solved problems first',
      tests.run_as(a, format($q$ select public.match_posts(%L::extensions.vector, 5, 0.5) -> 0 ->> 'id' $q$, tests.vec(0.6, 0.8)::text)), 'ok:' || p1);
    res := res || tests.chk('profile_stats counts the unblock',
      tests.run_as(b, format($q$ select (x ->> 'unblockedThisWeek') || '|' || (x ->> 'unblockedTotal') || '|' || (x ->> 'answersGiven') || '|' || (x ->> 'unblockRate') from public.profile_stats(%L) x $q$, a)), 'ok:1|1|1|1.000');
    r := tests.run_as(b, format($q$ select public.accept_answer(%L) ->> 'status' $q$, ans_b));
    res := res || tests.chk('accepting another answer moves the acceptance (own answer earns nothing)',
      r || '|'
      || (select count(*)::text from public.answers where post_id = p1 and is_accepted) || '|'
      || (select reputation::text from public.profiles where id = a) || '|' || (select reputation::text from public.profiles where id = b), 'ok:solved|1|0|0');
    r := tests.run_as(b, format($q$ select public.accept_answer(%L)::text $q$, ans_b));
    res := res || tests.chk('accepting the accepted answer again un-accepts it',
      r || '|' || (select status from public.posts where id = p1),
      'ok:{"status": "open", "acceptedAnswerId": null}|open');
    perform tests.run_as(b, format($q$ select public.accept_answer(%L) $q$, ans_a));
    r := tests.run_as(a, format($q$ select public.delete_answer(%L) $q$, ans_a));
    res := res || tests.chk('deleting the accepted answer reopens the post and fixes the counter',
      r || '|'
      || (select status || '|' || coalesce(accepted_answer_id::text, 'null') || '|' || answer_count from public.posts where id = p1), 'ok:|open|null|1');

    -- ============================================================ SECURITY: other people's rows
    res := res || tests.chk('SECURITY: A cannot update B''s post',
      tests.run_as(a, format($q$ with u as (update public.posts set title = 'hacked title zzqx' where id = %L returning 1) select count(*) from u $q$, p2)), 'ok:0');
    res := res || tests.chk('SECURITY: A cannot update B''s post through update_post',
      tests.run_as(a, format($q$ select public.update_post(%L, '{"title":"hacked title zzqx"}') $q$, p2)), 'err:P0001:forbidden%');
    res := res || tests.chk('SECURITY: A cannot delete B''s post',
      tests.run_as(a, format($q$ with d as (delete from public.posts where id = %L returning 1) select count(*) from d $q$, p2)), 'ok:0');
    res := res || tests.chk('SECURITY: A cannot delete B''s post through delete_post',
      tests.run_as(a, format($q$ select public.delete_post(%L) $q$, p2)), 'err:P0001:forbidden%');
    res := res || tests.chk('SECURITY: A cannot retag B''s post',
      tests.run_as(a, format($q$ insert into public.post_tags (post_id, interest_id) values (%L, 1) $q$, p2)), 'err:42501:%');
    res := res || tests.chk('SECURITY: A cannot remove tags from B''s post',
      tests.run_as(a, format($q$ with d as (delete from public.post_tags where post_id = %L returning 1) select count(*) from d $q$, p2)), 'ok:0');
    res := res || tests.chk('SECURITY: A cannot update B''s answer',
      tests.run_as(a, format($q$ with u as (update public.answers set body_md = 'hacked' where id = %L returning 1) select count(*) from u $q$, ans_b)), 'ok:0');
    res := res || tests.chk('SECURITY: A cannot delete B''s answer',
      tests.run_as(a, format($q$ with d as (delete from public.answers where id = %L returning 1) select count(*) from d $q$, ans_b)), 'ok:0');
    res := res || tests.chk('SECURITY: A cannot update B''s profile',
      tests.run_as(a, format($q$ with u as (update public.profiles set bio = 'hacked' where id = %L returning 1) select count(*) from u $q$, b)), 'ok:0');
    res := res || tests.chk('SECURITY: nobody can insert or delete profiles',
      tests.run_as(a, format($q$ delete from public.profiles where id = %L $q$, b)) || '|'
      || tests.run_as(a, $q$ insert into public.profiles (id, handle, display_name) values (gen_random_uuid(), 'hackerz', 'x') $q$), 'err:42501:%|err:42501:%');

    -- ============================================================ SECURITY: protected columns on your own rows
    res := res || tests.chk('SECURITY: cannot set status on your own post',
      tests.run_as(a, format($q$ update public.posts set status = 'solved' where id = %L $q$, pa)), 'err:42501:%');
    res := res || tests.chk('SECURITY: cannot set accepted_answer_id on your own post',
      tests.run_as(a, format($q$ update public.posts set accepted_answer_id = %L where id = %L $q$, ans_b, pa)), 'err:42501:%');
    res := res || tests.chk('SECURITY: cannot set counters on your own post',
      tests.run_as(a, format($q$ update public.posts set helpful_count = 999 where id = %L $q$, pa)) || '|'
      || tests.run_as(a, format($q$ update public.posts set answer_count = 9 where id = %L $q$, pa)) || '|'
      || tests.run_as(a, format($q$ update public.posts set view_count = 9 where id = %L $q$, pa)), 'err:42501:%|err:42501:%|err:42501:%');
    res := res || tests.chk('SECURITY: cannot write embedding, fts or author_id on your own post',
      tests.run_as(a, format($q$ update public.posts set embedding = null where id = %L $q$, pa)) || '|'
      || tests.run_as(a, format($q$ update public.posts set fts = null where id = %L $q$, pa)) || '|'
      || tests.run_as(a, format($q$ update public.posts set author_id = %L where id = %L $q$, b, pa)), 'err:42501:%|err:42501:%|err:42501:%');
    res := res || tests.chk('SECURITY: cannot insert a post with pre-set protected columns',
      tests.run_as(a, format($q$ insert into public.posts (author_id, title, status, helpful_count) values (%L, 'Pre-solved post zzqx', 'solved', 50) $q$, a)), 'err:42501:%');
    res := res || tests.chk('SECURITY: cannot set reputation, is_guest or onboarded on your own profile',
      tests.run_as(a, format($q$ update public.profiles set reputation = 9999 where id = %L $q$, a)) || '|'
      || tests.run_as(g, format($q$ update public.profiles set is_guest = false where id = %L $q$, g)) || '|'
      || tests.run_as(a, format($q$ update public.profiles set onboarded = false where id = %L $q$, a)), 'err:42501:%|err:42501:%|err:42501:%');
    res := res || tests.chk('SECURITY: cannot set is_accepted or helpful_count on your own answer',
      tests.run_as(b, format($q$ update public.answers set is_accepted = true where id = %L $q$, ans_b)) || '|'
      || tests.run_as(b, format($q$ update public.answers set helpful_count = 99 where id = %L $q$, ans_b)), 'err:42501:%|err:42501:%');
    r := tests.run_as(a, format($q$ select public.update_post(%L, '{"title":"Own post of member A zzqx edited","tags":["css","git"]}') ->> 'title' $q$, pa)) || '|'
      || tests.run_as(a, $q$ select public.update_profile('{"bio":"Salut","handle":"Test_User_A2"}') ->> 'handle' $q$);
    res := res || tests.chk('own rows stay editable on the allowed columns',
      r || '|'
      || (select count(*)::text from public.post_tags where post_id = pa), 'ok:Own post of member A zzqx edited|ok:test_user_a2|2');
    res := res || tests.chk('update_profile reports a taken handle as conflict',
      tests.run_as(a, format($q$ select public.update_profile(jsonb_build_object('handle', %L)) $q$, (select handle::text from public.profiles where id = b))), 'err:P0001:conflict%');

    -- ============================================================ SECURITY: private data of others
    perform tests.run_as(b, format($q$ select public.record_event(%L, 'open', null) $q$, pa));
    perform tests.run_as(b, format($q$ select public.set_saved(%L, true) $q$, pa));
    perform tests.run_as(b, $q$ select public.complete_onboarding('beginner', array['go','css'], null) $q$);
    perform tests.run_as(b, format($q$ select public.set_helpful('post', %L, true) $q$, pa));
    insert into public.ai_usage (user_id, calls) values (b, 1);
    res := res || tests.chk('B has private rows to protect (sanity)',
      (select (count(*) > 0)::text from public.events where user_id = b) || (select (count(*) > 0)::text from public.saves where user_id = b)
      || (select (count(*) > 0)::text from public.user_interests where user_id = b) || (select (count(*) > 0)::text from public.notifications where user_id = b)
      || (select (count(*) > 0)::text from public.votes where user_id = b), 'truetruetruetruetrue');
    res := res || tests.chk('SECURITY: A cannot read B''s events', tests.run_as(a, format($q$ select count(*) from public.events where user_id = %L $q$, b)), 'ok:0');
    res := res || tests.chk('SECURITY: A cannot read B''s saves', tests.run_as(a, format($q$ select count(*) from public.saves where user_id = %L $q$, b)), 'ok:0');
    res := res || tests.chk('SECURITY: A cannot read B''s user_interests', tests.run_as(a, format($q$ select count(*) from public.user_interests where user_id = %L $q$, b)), 'ok:0');
    res := res || tests.chk('SECURITY: A cannot read B''s notifications', tests.run_as(a, format($q$ select count(*) from public.notifications where user_id = %L $q$, b)), 'ok:0');
    res := res || tests.chk('SECURITY: A cannot read B''s votes', tests.run_as(a, format($q$ select count(*) from public.votes where user_id = %L $q$, b)), 'ok:0');
    res := res || tests.chk('SECURITY: A cannot read B''s ai_usage', tests.run_as(a, format($q$ select count(*) from public.ai_usage where user_id = %L $q$, b)), 'ok:0');
    res := res || tests.chk('SECURITY: A cannot fetch B''s notification by id',
      tests.run_as(a, format($q$ select coalesce(public.get_notification(%L)::text, 'null') $q$, (select id from public.notifications where user_id = b limit 1))), 'ok:null');
    res := res || tests.chk('SECURITY: A cannot mark B''s notifications read or delete them',
      tests.run_as(a, format($q$ with u as (update public.notifications set read = true where user_id = %L returning 1) select count(*) from u $q$, b)) || '|'
      || tests.run_as(a, format($q$ with d as (delete from public.notifications where user_id = %L returning 1) select count(*) from d $q$, b)), 'ok:0|ok:0');
    res := res || tests.chk('SECURITY: A cannot change B''s interest weights or delete B''s saves',
      tests.run_as(a, format($q$ with u as (update public.user_interests set weight = 0 where user_id = %L returning 1) select count(*) from u $q$, b)) || '|'
      || tests.run_as(a, format($q$ with d as (delete from public.saves where user_id = %L returning 1) select count(*) from d $q$, b)), 'ok:0|ok:0');
    res := res || tests.chk('SECURITY: ai_cache and reports are not readable by members',
      tests.run_as(a, $q$ select count(*) from public.ai_cache $q$) || '|' || tests.run_as(a, $q$ select count(*) from public.reports $q$), 'err:42501:%|err:42501:%');
    res := res || tests.chk('SECURITY: members cannot write ai_cache, ai_usage, interests or circles',
      tests.run_as(a, $q$ insert into public.ai_cache (hash, task, response, provider) values ('x', 'triage', '{}', 'x') $q$) || '|'
      || tests.run_as(a, format($q$ update public.ai_usage set calls = 0 where user_id = %L $q$, a)) || '|'
      || tests.run_as(a, $q$ insert into public.interests (id, slug, label_fr, label_en) values (99, 'x', 'x', 'x') $q$) || '|'
      || tests.run_as(a, $q$ update public.circles set name = 'hacked' $q$), 'err:42501:%|err:42501:%|err:42501:%|err:42501:%');
    res := res || tests.chk('SECURITY: members cannot call the AI budget function',
      tests.run_as(a, format($q$ select public.ai_consume(%L) $q$, a)), 'err:42501:%');
    res := res || tests.chk('get_profile exposes topics but never weights',
      tests.run_as(a, format($q$ select (x -> 'interests' -> 0 ? 'weight')::text || '|' || jsonb_array_length(x -> 'interests') || '|' || (x -> 'viewer')::text
        || '|' || (select string_agg(k, ',' order by k) from jsonb_object_keys(x -> 'profile') k) from public.get_profile(%L) x $q$, (select handle::text from public.profiles where id = b))),
      'ok:false|2|{"isSelf": false, "isFollowing": false}|avatarUrl,bio,createdAt,displayName,githubLogin,handle,id,isGuest,level,locale,onboarded,reputation');

    -- ============================================================ SECURITY: impersonation on insert
    res := res || tests.chk('SECURITY: cannot insert a post as someone else',
      tests.run_as(a, format($q$ insert into public.posts (author_id, title) values (%L, 'Spoofed author zzqx') $q$, b)), 'err:42501:%');
    res := res || tests.chk('SECURITY: cannot insert an answer as someone else',
      tests.run_as(a, format($q$ insert into public.answers (post_id, author_id, body_md) values (%L, %L, 'spoof') $q$, p2, b)), 'err:42501:%');
    res := res || tests.chk('SECURITY: cannot insert a message as someone else',
      tests.run_as(a, format($q$ insert into public.messages (circle_id, author_id, body) values (%L, %L, 'spoof') $q$, circle, b)), 'err:42501:%');
    res := res || tests.chk('SECURITY: cannot save, follow, join or report as someone else',
      tests.run_as(a, format($q$ insert into public.saves (user_id, post_id) values (%L, %L) $q$, b, p2)) || '|'
      || tests.run_as(a, format($q$ insert into public.follows (follower_id, followee_id) values (%L, %L) $q$, b, a)) || '|'
      || tests.run_as(a, format($q$ insert into public.circle_members (circle_id, user_id) values (%L, %L) $q$, circle, b)) || '|'
      || tests.run_as(a, format($q$ insert into public.reports (reporter_id, target_type, target_id, reason) values (%L, 'post', %L, 'x') $q$, b, p2)),
      'err:42501:%|err:42501:%|err:42501:%|err:42501:%');
    res := res || tests.chk('SECURITY: votes, events and notifications cannot be written directly',
      tests.run_as(a, format($q$ insert into public.votes (user_id, target_type, target_id) values (%L, 'post', %L) $q$, a, p2)) || '|'
      || tests.run_as(a, format($q$ insert into public.events (user_id, post_id, type) values (%L, %L, 'open') $q$, a, p2)) || '|'
      || tests.run_as(a, format($q$ insert into public.notifications (user_id, type, actor_id) values (%L, 'follow', %L) $q$, b, a)) || '|'
      || tests.run_as(a, format($q$ insert into public.user_interests (user_id, interest_id, weight) values (%L, 1, 1) $q$, b)),
      'err:42501:%|err:42501:%|err:42501:%|err:42501:%');

    -- ============================================================ SECURITY: anon sees nothing
    r := '';
    for r2 in select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' order by 1 loop
      if tests.run_as(null, format('select count(*) from public.%I', r2), 'anon') not like 'err:42501:%' then
        r := r || r2 || ' ';
      end if;
    end loop;
    res := res || tests.chk('SECURITY: anon cannot read any table', r, '');
    res := res || tests.chk('SECURITY: anon cannot call the feed, search or write RPCs',
      tests.run_as(null, $q$ select public.feed_for_user('latest', 5, 0, null) $q$, 'anon') || '|'
      || tests.run_as(null, $q$ select public.search_posts('react', 5, null) $q$, 'anon') || '|'
      || tests.run_as(null, $q$ select public.list_interests() $q$, 'anon') || '|'
      || tests.run_as(null, format($q$ select public.record_event(%L, 'open', null) $q$, p1), 'anon') || '|'
      || tests.run_as(null, $q$ select public.create_post('{}') $q$, 'anon'), 'err:42501:%|err:42501:%|err:42501:%|err:42501:%|err:42501:%');
    res := res || tests.chk('anon may only read the four landing counters',
      tests.run_as(null, $q$ select (select string_agg(k, ',' order by k) from jsonb_object_keys(public.platform_stats()) k) $q$, 'anon'), 'ok:members,problems,solved,unblockedThisWeek');
    res := res || tests.chk('CATALOG: anon has no privilege on any table or sequence of public',
      (select coalesce(string_agg(c.relname, ' '), '') from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'S', 'p')
         and (has_table_privilege('anon', c.oid, 'select') or (c.relkind <> 'S' and has_table_privilege('anon', c.oid, 'insert, update, delete, truncate')))), '');
    res := res || tests.chk('CATALOG: platform_stats is the only function anon can execute',
      (select coalesce(string_agg(p.proname, ' ' order by p.proname), '') from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')), 'platform_stats');
    res := res || tests.chk('CATALOG: row level security is enabled on every table of public',
      (select coalesce(string_agg(c.relname, ' '), '') from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), '');
    res := res || tests.chk('CATALOG: every function pins search_path',
      (select coalesce(string_agg(p.proname, ' '), '') from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private')
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')), '');
    res := res || tests.chk('CATALOG: trigger and service functions are not callable by members',
      (select coalesce(string_agg(p.proname, ' ' order by p.proname), '') from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and has_function_privilege('authenticated', p.oid, 'execute')
         and (p.proname like 'tg\_%' or p.proname like 'handle\_%' or p.proname in ('ai_consume', 'notify', 'post_fts'))), '');
    res := res || tests.chk('realtime publishes messages and notifications',
      (select string_agg(tablename, ',' order by tablename) from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('messages', 'notifications')), 'messages,notifications');

    -- ============================================================ limits
    res := res || tests.chk('LIMIT: title longer than 160 chars is a check violation',
      tests.run_as(a, format($q$ insert into public.posts (author_id, title) values (%L, %L) $q$, a, repeat('x', 161))), 'err:23514:%');
    res := res || tests.chk('LIMIT: title shorter than 8 chars → validation through create_post',
      tests.run_as(a, $q$ select public.create_post('{"title":"short","tags":["css"],"difficulty":"senior"}') $q$), 'err:P0001:validation%');
    res := res || tests.chk('LIMIT: body over 10 000 chars',
      tests.run_as(a, format($q$ update public.posts set body_md = %L where id = %L $q$, repeat('x', 10001), pa)), 'err:23514:%');
    res := res || tests.chk('LIMIT: code over 20 000 chars',
      tests.run_as(a, format($q$ update public.posts set code = %L where id = %L $q$, repeat('x', 20001), pa)), 'err:23514:%');
    res := res || tests.chk('LIMIT: repro over 60 000 bytes or with a wrong shape',
      tests.run_as(a, format($q$ update public.posts set repro = jsonb_build_object('html', %L, 'css', '', 'js', '') where id = %L $q$, repeat('x', 60001), pa)) || '|'
      || tests.run_as(a, format($q$ update public.posts set repro = '{"html":"","css":"","js":"","evil":"x"}' where id = %L $q$, pa)) || '|'
      || tests.run_as(a, format($q$ update public.posts set repro = '[1]' where id = %L $q$, pa)), 'err:23514:%|err:23514:%|err:23514:%');
    res := res || tests.chk('LIMIT: answer over 10 000 chars or empty',
      tests.run_as(a, format($q$ insert into public.answers (post_id, author_id, body_md) values (%L, %L, %L) $q$, p2, a, repeat('x', 10001))) || '|'
      || tests.run_as(a, format($q$ select public.create_answer(%L, '{"bodyMd":"  "}') $q$, p2)), 'err:23514:%|err:P0001:validation%');
    res := res || tests.chk('LIMIT: message over 1 000 chars or empty',
      tests.run_as(a, format($q$ insert into public.messages (circle_id, author_id, body) values (%L, %L, %L) $q$, circle, a, repeat('x', 1001))) || '|'
      || tests.run_as(a, format($q$ select public.send_message(%L, '') $q$, circle)), 'err:23514:%|err:P0001:validation%');
    res := res || tests.chk('LIMIT: bio over 280 chars',
      tests.run_as(a, format($q$ update public.profiles set bio = %L where id = %L $q$, repeat('x', 281), a)), 'err:23514:%');
    res := res || tests.chk('LIMIT: handle must match ^[a-z0-9_]{3,24}$',
      tests.run_as(a, format($q$ update public.profiles set handle = 'No' where id = %L $q$, a)) || '|'
      || tests.run_as(a, $q$ select public.update_profile('{"handle":"bad handle!"}') $q$), 'err:23514:%|err:P0001:validation%');
    res := res || tests.chk('LIMIT: avatar must be https or a local path',
      tests.run_as(a, format($q$ update public.profiles set avatar_url = 'javascript:alert(1)' where id = %L $q$, a)), 'err:23514:%');
    res := res || tests.chk('LIMIT: a post needs at least 1 tag',
      tests.run_as(a, format($q$ insert into public.posts (author_id, title) values (%L, 'A post without any tag zzqx') $q$, a)) || '|'
      || tests.run_as(a, $q$ select public.create_post('{"title":"A post without any tag zzqx","tags":[],"difficulty":"senior"}') $q$) || '|'
      || tests.run_as(a, format($q$ delete from public.post_tags where post_id = %L $q$, pa)), 'err:P0001:validation%|err:P0001:validation%|err:P0001:validation%');
    res := res || tests.chk('LIMIT: a post has at most 5 tags',
      tests.run_as(a, $q$ select public.create_post('{"title":"A post with six tags zzqx","tags":["css","git","go","php","java","react"],"difficulty":"senior"}') $q$) || '|'
      || tests.run_as(a, format($q$ insert into public.post_tags (post_id, interest_id) select %L, i.id from public.interests i where i.slug in ('go','php','java','react') $q$, pa)),
      'err:P0001:validation%|err:P0001:validation%');
    res := res || tests.chk('LIMIT: unknown tag, kind or difficulty → validation',
      tests.run_as(a, $q$ select public.create_post('{"title":"Unknown tag here zzqx","tags":["nope"],"difficulty":"senior"}') $q$) || '|'
      || tests.run_as(a, $q$ select public.create_post('{"title":"Unknown kind here zzqx","kind":"spam","tags":["css"],"difficulty":"senior"}') $q$) || '|'
      || tests.run_as(a, $q$ select public.create_post('{"title":"Unknown level here zzqx","tags":["css"],"difficulty":"god"}') $q$), 'err:P0001:validation%|err:P0001:validation%|err:P0001:validation%');

    -- ============================================================ chat, saves, circles, notifications, reports
    res := res || tests.chk('send_message returns a ChatMessage and chat_history lists it',
      tests.run_as(a, format($q$ select (select string_agg(k, ',' order by k) from jsonb_object_keys(m) k) from public.send_message(%L, ' Bonjour ') m $q$, circle)) || '|' ||
      tests.run_as(b, format($q$ select (h -> -1 ->> 'body') || '|' || (public.get_message((h -> -1 ->> 'id')::uuid) -> 'author' ->> 'handle') from public.chat_history(%L, 50) h $q$, circle)),
      'ok:author,body,circleId,createdAt,id|ok:Bonjour|test_user_a2');
    res := res || tests.chk('set_circle_member is idempotent and get_circle reflects it',
      tests.run_as(a, format($q$ select public.set_circle_member(%L, true) $q$, circle)) || tests.run_as(a, format($q$ select public.set_circle_member(%L, true) $q$, circle)),
      'ok:ok:');
    res := res || tests.chk('get_circle / list_circles are contract-shaped',
      tests.run_as(a, $q$ select (x ->> 'memberCount') || '|' || (x -> 'viewer' ->> 'isMember') || '|' || (select string_agg(k, ',' order by k) from jsonb_object_keys(x) k)
        || '|' || (jsonb_array_length(public.list_circles()) >= 1) from public.get_circle('zz-test-circle') x $q$),
      'ok:1|true|descriptionEn,descriptionFr,externalInviteUrl,id,interest,memberCount,name,postCount,slug,viewer|true');
    res := res || tests.chk('set_saved + saved_posts + viewer.saved',
      tests.run_as(a, format($q$ select public.set_saved(%L, true) $q$, p2)) || tests.run_as(a, format($q$ select public.set_saved(%L, true) $q$, p2)) ||
      tests.run_as(a, $q$ select (x -> 'items' -> 0 ->> 'id') || '|' || (x -> 'items' -> 0 -> 'viewer' ->> 'saved') || '|' || coalesce(x ->> 'nextCursor', 'null')
        from public.saved_posts(20, 0) x $q$), 'ok:ok:ok:' || p2 || '|true|null');
    res := res || tests.chk('list_notifications is contract-shaped; mark_notifications_read works',
      tests.run_as(b, $q$ select (select string_agg(k, ',' order by k) from jsonb_object_keys(n -> 0) k) || '|' || (n -> 0 -> 'actor' ->> 'handle') from public.list_notifications(30) n $q$)
      || '|' || tests.run_as(b, $q$ select public.mark_notifications_read() $q$) || '|' || tests.run_as(b, $q$ select count(*) from public.notifications where not read $q$),
      'ok:actor,createdAt,id,postId,postTitle,read,type|test_user_a2|ok:|ok:0');
    res := res || tests.chk('report_content stores a report once (idempotent), unreadable by the reporter',
      tests.run_as(a, format($q$ select public.report_content('post', %L, 'spam') $q$, p2)) || tests.run_as(a, format($q$ select public.report_content('post', %L, 'spam again') $q$, p2)), 'ok:ok:');
    res := res || tests.chk('… exactly one report row exists', (select count(*)::text from public.reports where reporter_id = a), '1');
    res := res || tests.chk('people_suggestions / user_posts / circle_posts / list_interests / my_profile respond',
      tests.run_as(a, format($q$ select jsonb_typeof(public.people_suggestions(5)) || '|' || (public.user_posts(%L, 2, 0) ->> 'nextCursor') || '|'
        || jsonb_typeof(public.circle_posts('zz-test-circle', 20, 0) -> 'items') || '|' || jsonb_array_length(public.list_interests()) || '|' || (public.my_profile() ->> 'level') $q$, b)),
      'ok:array|2|array|18|senior');
    res := res || tests.chk('unknown ids give not_found',
      tests.run_as(a, $q$ select public.get_post('00000000-0000-0000-0000-000000000001') $q$) || '|'
      || tests.run_as(a, $q$ select public.get_profile('nobody_here_zz') $q$) || '|' || tests.run_as(a, $q$ select public.get_circle('nope') $q$),
      'err:P0001:not_found%|err:P0001:not_found%|err:P0001:not_found%');
    r := tests.run_as(a, format($q$ select public.delete_post(%L) $q$, pa));
    res := res || tests.chk('deleting a post removes its votes, tags and answers',
      r || '|'
      || (select count(*)::text from public.votes where target_id = pa) || (select count(*)::text from public.post_tags where post_id = pa), 'ok:|00');

    -- ============================================================ rate limits
    r := tests.run_as(g, $q$ select count(*) from (select public.create_post(jsonb_build_object('title', 'Rate limit probe zzqx ' || n, 'tags', array['git'], 'difficulty', 'beginner')) from generate_series(1, 9) n) x $q$);
    res := res || tests.chk('RATE: 10 posts in an hour are accepted', r, 'ok:9');
    res := res || tests.chk('RATE: the 11th post in an hour is refused with rate_limited',
      tests.run_as(g, $q$ select public.create_post('{"title":"Rate limit probe zzqx 11","tags":["git"],"difficulty":"beginner"}') $q$), 'err:P0001:rate_limited%');
    res := res || tests.chk('RATE: … also through a direct insert',
      tests.run_as(g, format($q$ insert into public.posts (author_id, title) values (%L, 'Rate limit probe zzqx direct') $q$, g)), 'err:P0001:rate_limited%');
    perform tests.run_as(g, format($q$ select count(*) from (select public.send_message(%L, 'msg ' || n) from generate_series(1, 20) n) x $q$, circle));
    res := res || tests.chk('RATE: the 21st chat message in a minute is refused',
      tests.run_as(g, format($q$ select public.send_message(%L, 'one too many') $q$, circle)), 'err:P0001:rate_limited%');
    perform tests.run_as(g, format($q$ select count(*) from (select public.create_answer(%L, jsonb_build_object('bodyMd', 'answer ' || n)) from generate_series(1, 30) n) x $q$, p2));
    res := res || tests.chk('RATE: the 31st answer in an hour is refused',
      tests.run_as(g, format($q$ select public.create_answer(%L, '{"bodyMd":"one too many"}') $q$, p2)), 'err:P0001:rate_limited%');
    for i in 1..8 loop
      r := tests.run_as(null, format($q$ select public.ai_consume(%L) ->> 'allowed' $q$, g), 'service_role');
    end loop;
    res := res || tests.chk('RATE: guests get 8 AI calls a day, then the gateway is told to degrade',
      r || '|' || tests.run_as(null, format($q$ select public.ai_consume(%L)::text $q$, g), 'service_role'), 'ok:true|ok:{"calls": 8, "limit": 8, "allowed": false}');
    res := res || tests.chk('RATE: the AI counter itself refuses to go past the budget',
      tests.run_as(null, format($q$ update public.ai_usage set calls = 21 where user_id = %L $q$, b), 'service_role'), 'err:P0001:rate_limited%');

    raise exception 'tests_rollback';
  exception when others then
    if sqlerrm <> 'tests_rollback' then
      res := res || jsonb_build_object('name', 'HARNESS ERROR (checks after this point did not run)', 'pass', false,
        'detail', sqlstate || ': ' || sqlerrm);
    end if;
  end;
  reset role;

  return query
    select t.n::integer, case when (t.x ->> 'pass')::boolean then 'PASS' else 'FAIL' end, t.x ->> 'name', t.x ->> 'detail'
    from jsonb_array_elements(res) with ordinality t (x, n)
    union all
    select 9999, 'SUMMARY',
           count(*) filter (where (x ->> 'pass')::boolean) || ' passed, ' || count(*) filter (where not (x ->> 'pass')::boolean) || ' failed',
           case when count(*) filter (where not (x ->> 'pass')::boolean) = 0 then 'ALL PASS' else 'FAILURES' end
    from jsonb_array_elements(res) x
    order by 1;
end $$;

-- @@chunk

select result, name, detail from tests.run_all();

-- @@chunk

drop schema if exists tests cascade;
