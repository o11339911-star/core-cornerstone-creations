create or replace function public.respond_to_project_party(_party_id uuid, _accept boolean)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_party public.project_parties%rowtype;
  v_project public.projects%rowtype;
  v_perm jsonb;
  v_grant_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select * into v_party from public.project_parties where id = _party_id for update;
  if v_party.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  if v_party.status <> 'invited' then raise exception 'INVITATION_NOT_PENDING' using errcode = '22023'; end if;
  if v_party.party_entity_id is null
     or not (private.has_role(v_actor, v_party.party_entity_id, 'owner')
          or private.has_role(v_actor, v_party.party_entity_id, 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_project from public.projects where id = v_party.project_id;

  update public.project_parties
     set status = case when _accept then 'accepted' else 'rejected' end,
         responded_by = v_actor, responded_at = now()
   where id = _party_id;

  if _accept then
    for v_perm in select * from jsonb_array_elements(coalesce(v_party.permissions_snapshot, '[]'::jsonb)) loop
      insert into public.permission_grants
        (subject_entity_id, scope_type, scope_project_id, module, action, effect, granted_by)
      values
        (v_party.party_entity_id, 'project', v_party.project_id,
         (v_perm ->> 'module')::public.app_module, (v_perm ->> 'action')::public.app_action,
         'allow', v_actor)
      returning id into v_grant_id;

      insert into public.project_party_permissions(party_id, grant_id) values (_party_id, v_grant_id);
    end loop;
  end if;

  insert into public.permission_audit_log
    (actor_user_id, target_entity_id, target_project_id, object_type, object_id, action, new_value)
  values (v_actor, v_project.entity_id, v_party.project_id, 'project_party', _party_id, 'update',
          jsonb_build_object('reference', v_party.party_reference,
                             'response', case when _accept then 'accepted' else 'rejected' end,
                             'invited_by', v_party.invited_by,
                             'permissions', coalesce(v_party.permissions_snapshot, '[]'::jsonb)));

  return case when _accept then 'accepted' else 'rejected' end;
end $function$;

revoke all on function public.respond_to_project_party(uuid, boolean) from public, anon;
grant execute on function public.respond_to_project_party(uuid, boolean) to authenticated;