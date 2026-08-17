revoke execute on function public.can_issue_engineering_report(uuid, uuid) from anon;
revoke execute on function public.list_project_engineering_offices(uuid) from anon;
revoke execute on function public.request_engineering_report(uuid, uuid, text, text, uuid, uuid) from anon;
revoke execute on function public.create_report(uuid, uuid, text, uuid, text, uuid, uuid, uuid, text, uuid) from anon;
revoke execute on function public.enforce_engineering_report_issuer() from anon, authenticated;