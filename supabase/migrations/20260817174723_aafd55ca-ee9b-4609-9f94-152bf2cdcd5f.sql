alter table public.reports drop constraint if exists reports_report_kind_chk;

revoke all on function private.is_engineering_entity(uuid) from public, anon, authenticated;
revoke all on function private.is_inspection_entity(uuid) from public, anon, authenticated;
revoke all on function private.assert_can_issue_engineering_report(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.assert_can_issue_inspection_report(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.engineering_report_block_reason(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.inspection_report_block_reason(uuid, uuid, uuid) from public, anon, authenticated;

revoke all on function public.can_issue_engineering_report(uuid, uuid) from public, anon;
grant execute on function public.can_issue_engineering_report(uuid, uuid) to authenticated;
revoke all on function public.can_issue_inspection_report(uuid, uuid) from public, anon;
grant execute on function public.can_issue_inspection_report(uuid, uuid) to authenticated;