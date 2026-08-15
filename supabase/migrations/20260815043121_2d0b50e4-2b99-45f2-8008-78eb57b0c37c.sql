
alter table public.permission_audit_log drop constraint permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array[
    'membership','grant','project_party',
    'contracts','contract_versions','contract_extensions','change_orders'
  ]));
