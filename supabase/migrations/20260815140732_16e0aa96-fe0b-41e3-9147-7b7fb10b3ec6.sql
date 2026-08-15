alter table public.permission_audit_log drop constraint permission_audit_action_ck;
alter table public.permission_audit_log add constraint permission_audit_action_ck check (action = any (array[
  'insert','update','revoke','delete','status_change','assign','reassign','resolve','grant','request','approve','deny',
  'check_in','register','blur_ack','submit','review_approve','review_reject','owner_approve','owner_reject','publish','share'
]));

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('can_access_property','can_manage_property','can_access_project','is_project_insider',
                        'can_access_document','doc_id_from_object','can_manage_document','report_id_from_object',
                        'can_access_report','can_touch_import_object')
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

create policy media_public_write on storage.objects for insert to authenticated
with check (
  bucket_id = 'media-360-public'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can(auth.uid(), 'media'::public.app_module, 'share'::public.app_action, null, ((storage.foldername(name))[1])::uuid)
);

create policy media_public_read on storage.objects for select to authenticated
using (
  bucket_id = 'media-360-public'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can(auth.uid(), 'media'::public.app_module, 'view'::public.app_action, null, ((storage.foldername(name))[1])::uuid)
);