
create or replace function public.audit_contract_change()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_contract uuid;
  v_project uuid;
begin
  if tg_table_name = 'contracts' then
    v_contract := coalesce(new.id, old.id);
  else
    v_contract := coalesce(new.contract_id, old.contract_id);
  end if;

  select project_id into v_project from public.contracts where id = v_contract;

  insert into public.permission_audit_log(
    actor_user_id, target_project_id, object_type, object_id, action, old_value, new_value)
  values (
    auth.uid(), v_project, tg_table_name, coalesce(new.id, old.id),
    case tg_op when 'INSERT' then 'insert' when 'UPDATE' then 'update' else 'delete' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.audit_contract_change() from public, anon, authenticated;
