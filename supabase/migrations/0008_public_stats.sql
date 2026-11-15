-- devloop — 0008: the landing page shows three aggregate counters to visitors who are not
-- signed in. platform_stats() returns counts only (no row data), so it is safe to expose.
grant execute on function public.platform_stats() to anon;
