-- 1) offboarding must use an allowed membership status
CREATE OR REPLACE FUNCTION public.offboard_member(_entity_id uuid, _user_id uuid, _replacement_user_id uuid DEFAULT NULL::uuid, _reason text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_a record;
  v_new_id uuid;
  v_moved int := 0;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if _user_id = v_actor then
    raise exception 'A member cannot offboard themselves' using errcode = '42501';
  end if;
  if not private.can(v_actor, 'members', 'manage_members', _entity_id, null) then
    raise exception 'Not allowed to manage members of this entity' using errcode = '42501';
  end if;

  update public.entity_memberships
    set status = 'revoked'
    where user_id = _user_id and entity_id = _entity_id;

  update public.permission_grants
    set revoked_at = now()
    where subject_user_id = _user_id
      and scope_entity_id = _entity_id
      and revoked_at is null;

  for v_a in
    select * from public.project_assignments
    where user_id = _user_id
      and entity_id = _entity_id
      and status = 'active'
      and deleted_at is null
  loop
    v_new_id := null;

    if _replacement_user_id is not null then
      insert into public.project_assignments
        (project_id, stage_id, user_id, entity_id, job_title_ar, job_title_en,
         starts_on, status, visibility, created_by)
      values
        (v_a.project_id, v_a.stage_id, _replacement_user_id, v_a.entity_id,
         v_a.job_title_ar, v_a.job_title_en, current_date, 'active', v_a.visibility, v_actor)
      returning id into v_new_id;
    end if;

    update public.project_assignments
      set status = case when v_new_id is null then 'ended' else 'transferred' end,
          ends_on = current_date
      where id = v_a.id;

    insert into public.assignment_transfers
      (project_id, from_assignment_id, to_assignment_id, from_user_id, to_user_id,
       reason, transferred_by)
    values
      (v_a.project_id, v_a.id, v_new_id, _user_id, _replacement_user_id, _reason, v_actor);

    v_moved := v_moved + 1;
  end loop;

  return v_moved;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.offboard_member(uuid, uuid, uuid, text) FROM anon;

-- 2) plain entity members no longer inherit access to every entity project
CREATE OR REPLACE FUNCTION private.can(_user_id uuid, _module app_module, _action app_action, _entity_id uuid DEFAULT NULL::uuid, _project_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entity_id uuid := _entity_id;
  v_owner_id uuid;
begin
  if _user_id is null then
    return false;
  end if;

  if _project_id is not null then
    select p.owner_id, coalesce(v_entity_id, p.entity_id)
      into v_owner_id, v_entity_id
    from public.projects p
    where p.id = _project_id and p.deleted_at is null;

    if v_owner_id is null then
      return false;
    end if;

    if v_owner_id = _user_id then
      return true;
    end if;
  end if;

  if v_entity_id is null then
    return false;
  end if;

  -- explicit deny always wins
  if exists (
    select 1 from public.permission_grants g
    where g.subject_user_id = _user_id
      and g.module = _module
      and g.action = _action
      and g.effect = 'deny'
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and (
        (g.scope_type = 'project' and g.scope_project_id = _project_id)
        or (g.scope_type = 'entity' and g.scope_entity_id = v_entity_id)
      )
  ) then
    return false;
  end if;

  -- role-based permission inside the entity.
  -- When the question is about a specific project, only entity leadership
  -- (owner/admin/manager) inherits it entity-wide; everyone else needs an
  -- explicit project assignment or grant.
  if exists (
    select 1
    from public.entity_memberships em
    join public.role_permissions rp on rp.role = em.role
    where em.user_id = _user_id
      and em.entity_id = v_entity_id
      and em.status = 'active'
      and (em.expires_at is null or em.expires_at > now())
      and rp.module = _module
      and rp.action = _action
      and (
        _project_id is null
        or em.role in ('owner'::public.app_role, 'admin'::public.app_role, 'manager'::public.app_role)
      )
  ) then
    return true;
  end if;

  -- an active project assignment carries the assignee's entity role
  -- for that project only (never entity-wide)
  if _project_id is not null and private.has_project_assignment(_user_id, _project_id) then
    if exists (
      select 1
      from public.project_assignments a
      join public.entity_memberships em
        on em.user_id = a.user_id
       and em.entity_id = coalesce(a.entity_id, v_entity_id)
       and em.status = 'active'
      join public.role_permissions rp on rp.role = em.role
      where a.user_id = _user_id
        and a.project_id = _project_id
        and a.status = 'active'
        and a.deleted_at is null
        and rp.module = _module
        and rp.action = _action
    ) then
      return true;
    end if;
  end if;

  return exists (
    select 1 from public.permission_grants g
    where g.subject_user_id = _user_id
      and g.module = _module
      and g.action = _action
      and g.effect = 'allow'
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and (
        (g.scope_type = 'project' and g.scope_project_id = _project_id)
        or (g.scope_type = 'entity' and g.scope_entity_id = v_entity_id)
      )
  );
end;
$function$;

-- 3) "internal" assignments are only identifiable to the person themselves,
--    the project owner, and the entity leadership
CREATE OR REPLACE FUNCTION private.can_see_assignee(_viewer uuid, _assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.project_assignments a
    where a.id = _assignment_id
      and (
        a.user_id = _viewer
        or a.visibility = 'project_wide'
        or (a.visibility = 'internal' and a.entity_id is not null
            and (
              private.has_role(_viewer, a.entity_id, 'owner')
              or private.has_role(_viewer, a.entity_id, 'admin')
              or private.has_role(_viewer, a.entity_id, 'manager')
            ))
        or (a.visibility = 'limited' and exists (
              select 1 from public.assignment_visibility_audience v
              where v.assignment_id = a.id
                and (
                  v.audience_user_id = _viewer
                  or (v.audience_entity_id is not null
                      and private.is_entity_member(_viewer, v.audience_entity_id))
                )
            ))
        or exists (select 1 from public.projects p
                   where p.id = a.project_id and p.owner_id = _viewer)
      )
  );
$function$;