create or replace function private.audit_entity_activity_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.permission_audit_log (actor_user_id, target_entity_id, action, object_type, object_id, old_value, new_value)
  values (
    auth.uid(),
    coalesce(new.entity_id, old.entity_id),
    lower(tg_op),
    'entity_activities',
    coalesce(new.id, old.id),
    to_jsonb(old),
    to_jsonb(new)
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_entity_activity_change() from public, anon, authenticated;