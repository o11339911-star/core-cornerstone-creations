alter table public.permission_audit_log drop constraint if exists permission_audit_action_ck;
alter table public.permission_audit_log add constraint permission_audit_action_ck
  check (action = any (array[
    'insert','update','revoke','delete','status_change',
    'assign','reassign','resolve','grant','request','approve','deny'
  ]));