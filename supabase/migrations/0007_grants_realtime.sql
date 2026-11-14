-- devloop — 0007: function privileges (single place to audit) and realtime.
-- Sweep first: nothing is callable unless listed below.

revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema public  to service_role;
grant execute on all functions in schema private to service_role;

-- The one thing an unauthenticated visitor may call: four aggregate counters for the landing page.
grant execute on function public.platform_stats() to anon, authenticated;

-- Shaping helpers used by SECURITY INVOKER RPCs (schema `private` is not exposed by the API).
grant execute on function private.uid() to authenticated;
grant execute on function private.eff_weight(real, timestamptz) to authenticated;
grant execute on function private.level_rank(public.level_t) to authenticated;
grant execute on function private.clamp(integer, integer, integer) to authenticated;
grant execute on function private.interest_json(public.interests) to authenticated;
grant execute on function private.author_json(public.profiles) to authenticated;
grant execute on function private.profile_json(public.profiles) to authenticated;
grant execute on function private.posts_json(uuid[]) to authenticated;
grant execute on function private.posts_page(uuid[], integer, integer) to authenticated;
grant execute on function private.answers_json(uuid[]) to authenticated;
grant execute on function private.circle_json(public.circles) to authenticated;
grant execute on function private.message_json(public.messages) to authenticated;
grant execute on function private.notification_json(public.notifications) to authenticated;
grant execute on function private.tag_ids(jsonb) to authenticated;
grant execute on function private.text_array(jsonb) to authenticated;
grant execute on function public.f_unaccent(text) to authenticated;

-- Reads
grant execute on function public.list_interests() to authenticated;
grant execute on function public.my_interests() to authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.profile_stats(uuid) to authenticated;
grant execute on function public.get_profile(text) to authenticated;
grant execute on function public.people_suggestions(integer) to authenticated;
grant execute on function public.search_people(text, integer) to authenticated;
grant execute on function public.get_post(uuid) to authenticated;
grant execute on function public.list_answers(uuid) to authenticated;
grant execute on function public.circle_posts(text, integer, integer) to authenticated;
grant execute on function public.user_posts(uuid, integer, integer) to authenticated;
grant execute on function public.saved_posts(integer, integer) to authenticated;
grant execute on function public.search_posts(text, integer, text) to authenticated;
grant execute on function public.match_posts(extensions.vector, integer, double precision) to authenticated;
grant execute on function public.list_circles() to authenticated;
grant execute on function public.get_circle(text) to authenticated;
grant execute on function public.chat_history(uuid, integer) to authenticated;
grant execute on function public.get_message(uuid) to authenticated;
grant execute on function public.list_notifications(integer) to authenticated;
grant execute on function public.get_notification(uuid) to authenticated;
grant execute on function public.feed_for_user(text, integer, integer, text) to authenticated;

-- Writes
grant execute on function public.record_event(uuid, text, real) to authenticated;
grant execute on function public.set_interest_weight(integer, real) to authenticated;
grant execute on function public.set_interest_muted(integer, boolean) to authenticated;
grant execute on function public.save_interests(jsonb) to authenticated;
grant execute on function public.reset_learning() to authenticated;
grant execute on function public.complete_onboarding(text, text[], text) to authenticated;
grant execute on function public.update_profile(jsonb) to authenticated;
grant execute on function public.set_following(uuid, boolean) to authenticated;
grant execute on function public.set_circle_member(uuid, boolean) to authenticated;
grant execute on function public.set_saved(uuid, boolean) to authenticated;
grant execute on function public.set_helpful(text, uuid, boolean) to authenticated;
grant execute on function public.accept_answer(uuid) to authenticated;
grant execute on function public.create_post(jsonb) to authenticated;
grant execute on function public.update_post(uuid, jsonb) to authenticated;
grant execute on function public.delete_post(uuid) to authenticated;
grant execute on function public.create_answer(uuid, jsonb) to authenticated;
grant execute on function public.delete_answer(uuid) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.report_content(text, uuid, text) to authenticated;
-- public.ai_consume(uuid): service role only (AI gateway).

-- ---------------------------------------------------------------- realtime
do $$
declare t text;
begin
  if not exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['messages', 'notifications'] loop
    if not exists (select 1 from pg_catalog.pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Ask PostgREST to pick up the new functions immediately.
notify pgrst, 'reload schema';
