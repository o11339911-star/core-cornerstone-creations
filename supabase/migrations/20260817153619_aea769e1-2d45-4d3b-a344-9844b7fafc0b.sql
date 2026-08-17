create or replace function public.can_manage_project_parties(_project_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.projects%rowtype;
begin
  if v_actor is null then return false; end if;
  select * into v_project from public.projects where id = _project_id and deleted_at is null;
  if not found then return false; end if;
  if v_project.owner_id = v_actor then return true; end if;
  return private.can(v_actor, 'members'::public.app_module, 'manage_members'::public.app_action, v_project.entity_id, _project_id)
      or private.can(v_actor, 'projects'::public.app_module, 'update'::public.app_action, v_project.entity_id, _project_id);
end;
$$;

revoke execute on function public.can_manage_project_parties(uuid) from public, anon;
grant execute on function public.can_manage_project_parties(uuid) to authenticated;