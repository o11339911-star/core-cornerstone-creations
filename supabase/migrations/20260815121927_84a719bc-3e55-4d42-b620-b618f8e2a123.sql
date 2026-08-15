create or replace function public.validate_permission_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_scope_entity uuid;
  v_platform boolean := false;
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

  -- Platform-administration path: read-only, time-bound grants issued by authorised platform staff
  v_platform := new.effect = 'allow'
    and new.action = 'view'::public.app_action
    and new.expires_at is not null
    and (private.platform_can(v_actor, 'case.grant') or private.platform_can(v_actor, 'breakglass.approve'));

  if not v_platform then
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
          select 1
          from public.entity_memberships em
          where em.user_id = new.subject_user_id
            and em.status = 'active'
            and private.entity_ceiling(em.entity_id, new.scope_project_id, new.module, new.action)
        ) then
          raise exception 'Grant exceeds the ceiling granted to the external entity'
            using errcode = '42501';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;