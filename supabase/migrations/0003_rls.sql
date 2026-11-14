-- devloop — 0003: privileges and row level security.
-- Principle: `anon` gets nothing; `authenticated` gets table privileges narrowed to the
-- columns it may write, and RLS narrows the rows. Protected columns (status,
-- accepted_answer_id, counters, reputation, is_accepted, embedding, fts, is_guest, …) are
-- simply not granted, so they can only change through SECURITY DEFINER RPCs/triggers.

revoke all on all tables in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

alter table public.profiles        enable row level security;
alter table public.interests       enable row level security;
alter table public.user_interests  enable row level security;
alter table public.follows         enable row level security;
alter table public.circles         enable row level security;
alter table public.circle_members  enable row level security;
alter table public.posts           enable row level security;
alter table public.post_tags       enable row level security;
alter table public.answers         enable row level security;
alter table public.votes           enable row level security;
alter table public.saves           enable row level security;
alter table public.events          enable row level security;
alter table public.messages        enable row level security;
alter table public.notifications   enable row level security;
alter table public.reports         enable row level security;
alter table public.ai_cache        enable row level security;
alter table public.ai_usage        enable row level security;

-- ---------------------------------------------------------------- profiles
grant select on public.profiles to authenticated;
grant update (handle, display_name, avatar_url, bio, level, locale) on public.profiles to authenticated;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------- interests (read only)
grant select on public.interests to authenticated;
drop policy if exists interests_select on public.interests;
create policy interests_select on public.interests for select to authenticated using (true);

-- ---------------------------------------------------------------- user_interests (owner only)
grant select, insert, delete on public.user_interests to authenticated;
grant update (weight, muted, source, base_weight, updated_at) on public.user_interests to authenticated;
drop policy if exists user_interests_select_own on public.user_interests;
create policy user_interests_select_own on public.user_interests for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists user_interests_insert_own on public.user_interests;
create policy user_interests_insert_own on public.user_interests for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists user_interests_update_own on public.user_interests;
create policy user_interests_update_own on public.user_interests for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists user_interests_delete_own on public.user_interests;
create policy user_interests_delete_own on public.user_interests for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- follows
grant select, delete on public.follows to authenticated;
grant insert (follower_id, followee_id) on public.follows to authenticated;
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select to authenticated using (true);
drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- ---------------------------------------------------------------- circles (read only) & members
grant select on public.circles to authenticated;
drop policy if exists circles_select on public.circles;
create policy circles_select on public.circles for select to authenticated using (true);

grant select, delete on public.circle_members to authenticated;
grant insert (circle_id, user_id) on public.circle_members to authenticated;
drop policy if exists circle_members_select on public.circle_members;
create policy circle_members_select on public.circle_members for select to authenticated using (true);
drop policy if exists circle_members_insert_own on public.circle_members;
create policy circle_members_insert_own on public.circle_members for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists circle_members_delete_own on public.circle_members;
create policy circle_members_delete_own on public.circle_members for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- posts
grant select, delete on public.posts to authenticated;
grant insert (author_id, circle_id, kind, title, body_md, code, language, repro, difficulty, ai_summary, ai_hints)
  on public.posts to authenticated;
grant update (circle_id, kind, title, body_md, code, language, repro, difficulty, ai_summary, ai_hints)
  on public.posts to authenticated;
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated using (true);
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()));
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts for delete to authenticated
  using (author_id = (select auth.uid()));

grant select, insert, delete on public.post_tags to authenticated;
drop policy if exists post_tags_select on public.post_tags;
create policy post_tags_select on public.post_tags for select to authenticated using (true);
drop policy if exists post_tags_insert_own on public.post_tags;
create policy post_tags_insert_own on public.post_tags for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));
drop policy if exists post_tags_delete_own on public.post_tags;
create policy post_tags_delete_own on public.post_tags for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));

-- ---------------------------------------------------------------- answers
grant select, delete on public.answers to authenticated;
grant insert (post_id, author_id, body_md, repro, is_ai) on public.answers to authenticated;
grant update (body_md, repro) on public.answers to authenticated;
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers for select to authenticated using (true);
drop policy if exists answers_insert_own on public.answers;
create policy answers_insert_own on public.answers for insert to authenticated
  with check (author_id = (select auth.uid()));
drop policy if exists answers_update_own on public.answers;
create policy answers_update_own on public.answers for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists answers_delete_own on public.answers;
create policy answers_delete_own on public.answers for delete to authenticated
  using (author_id = (select auth.uid()));

-- ---------------------------------------------------------------- votes (read own; written only by set_helpful)
grant select on public.votes to authenticated;
drop policy if exists votes_select_own on public.votes;
create policy votes_select_own on public.votes for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- saves (owner only)
grant select, delete on public.saves to authenticated;
grant insert (user_id, post_id) on public.saves to authenticated;
drop policy if exists saves_select_own on public.saves;
create policy saves_select_own on public.saves for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists saves_insert_own on public.saves;
create policy saves_insert_own on public.saves for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists saves_delete_own on public.saves;
create policy saves_delete_own on public.saves for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- events (read own; written only by record_event)
grant select on public.events to authenticated;
drop policy if exists events_select_own on public.events;
create policy events_select_own on public.events for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- messages
grant select, delete on public.messages to authenticated;
grant insert (circle_id, author_id, body) on public.messages to authenticated;
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (true);
drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages for insert to authenticated
  with check (author_id = (select auth.uid()));
drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own on public.messages for delete to authenticated
  using (author_id = (select auth.uid()));

-- ---------------------------------------------------------------- notifications (owner only; only `read` is writable)
grant select, delete on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- reports (write-only for clients)
grant insert (reporter_id, target_type, target_id, reason) on public.reports to authenticated;
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- ---------------------------------------------------------------- AI bookkeeping
-- ai_cache: no policy, no grant → service role only.
grant select on public.ai_usage to authenticated;
drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));
