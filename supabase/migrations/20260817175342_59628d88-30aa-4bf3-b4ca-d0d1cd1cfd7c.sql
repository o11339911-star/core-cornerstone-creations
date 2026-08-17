create or replace function public.validate_permission_grant()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_scope_entity uuid;
  v_platform boolean := false;
  v_party_accept boolean := false;
begin
  if v_actor is null then
    return new;
  end if;

  if new.granted_by <> v_actor then
    raise exception 'granted_by must be the acting user' using errcode = '42501';
  end if;

  if new.subject_user_id = v_actor then
    raise exception 'A user cannot grant permissions to themselves' using errcode = '42501';
  end if;

  v_scope_entity := new.scope_entity_id;
  if v_scope_entity is null and new.scope_project_id is not null then
    select p.entity_id into v_scope_entity from public.projects p where p.id = new.scope_project_id;
  end if;

  -- Invitation-acceptance path: the grant must match, exactly, a snapshot approved at invite time
  v_party_accept := coalesce(current_setting('app.party_invite_apply', true), '') = 'on'
    and new.effect = 'allow'
    and new.subject_user_id is null
    and new.scope_type = 'project'
    and exists (
      select 1
      from public.project_parties pp
      where pp.project_id = new.scope_project_id
        and pp.party_entity_id = new.subject_entity_id
        and pp.status = 'accepted'
        and pp.responded_by = v_actor
        and pp.permissions_snapshot @> jsonb_build_array(
              jsonb_build_object('module', new.module::text, 'action', new.action::text))
    );

  -- Platform-administration path: read-only, time-bound grants issued by authorised platform staff
  v_platform := new.effect = 'allow'
    and new.action = 'view'::public.app_action
    and new.expires_at is not null
    and (private.platform_can(v_actor, 'case.grant') or private.platform_can(v_actor, 'breakglass.approve'));

  if not v_platform and not v_party_accept then
    if not private.can(v_actor, new.module, 'share'::public.app_action, v_scope_entity, new.scope_project_id) then
      raise exception 'Not allowed to manage permissions in this scope' using errcode = '42501';
    end if;

    if new.effect = 'allow'
       and not private.can(v_actor, new.module, new.action, v_scope_entity, new.scope_project_id) then
      raise exception 'Cannot grant a permission the granter does not hold' using errcode = '42501';
    end if;

    if new.effect = 'allow' and new.subject_user_id is not null and v_scope_entity is not null then
      if not private.is_entity_member(new.subject_user_id, v_scope_entity) then
        if not exists (
          select 1 from public.entity_memberships em
          where em.user_id = new.subject_user_id and em.status = 'active'
            and private.entity_ceiling(em.entity_id, new.scope_project_id, new.module, new.action)
        ) then
          raise exception 'Grant exceeds the ceiling granted to the external entity' using errcode = '42501';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$function$;

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
    perform set_config('app.party_invite_apply', 'on', true);
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
    perform set_config('app.party_invite_apply', 'off', true);
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