revoke all on public.platform_staff from anon;
revoke all on public.platform_queue_items from anon;
revoke all on public.platform_case_access from anon;
revoke all on public.platform_breakglass_requests from anon;
grant select on public.platform_staff, public.platform_queue_items, public.platform_case_access, public.platform_breakglass_requests to authenticated;
revoke references, trigger on public.platform_staff, public.platform_queue_items, public.platform_case_access, public.platform_breakglass_requests from authenticated;

revoke all on function public.property_completion(uuid) from anon, public;
grant execute on function public.property_completion(uuid) to authenticated;
revoke all on function public.guard_property_service_write() from anon, public;
revoke all on function public.report_version_guard() from anon, public;