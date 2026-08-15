alter table public.permission_audit_log drop constraint permission_audit_action_ck;
alter table public.permission_audit_log add constraint permission_audit_action_ck check (action = any (array[
  'insert','update','revoke','delete','status_change','assign','reassign','resolve','grant','request','approve','deny',
  'check_in','register','blur_ack','submit','review_approve','review_reject','owner_approve','owner_reject','publish','share','withdraw'
]));