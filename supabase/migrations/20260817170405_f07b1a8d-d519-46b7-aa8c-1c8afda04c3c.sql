-- سجل تعديلات الملف: قراءة وإضافة للمستخدم المسجل فقط (ضمن RLS)، ولا شيء للزائر
revoke all on public.archive_item_versions from anon, authenticated;
grant select, insert on public.archive_item_versions to authenticated;
grant all on public.archive_item_versions to service_role;

-- بصمات ركيز: تُكتب وتُقرأ عبر دوال SECURITY DEFINER فقط
revoke all on public.archive_stamps from anon, authenticated;
grant all on public.archive_stamps to service_role;

-- أداة التحقق العامة
revoke execute on function public.verify_archive_file(text, date) from public;
grant execute on function public.verify_archive_file(text, date) to anon, authenticated, service_role;

revoke execute on function public.issue_archive_stamp(uuid, text, uuid) from public;
grant execute on function public.issue_archive_stamp(uuid, text, uuid) to authenticated, service_role;

revoke execute on function private.gen_archive_reference() from public;