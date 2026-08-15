create or replace function private.can(
  _user_id uuid,
  _module public.app_module,
  _action public.app_action,
  _entity_id uuid default null,
  _project_id uuid default null
) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_entity_id uuid := _entity_id;
  v_owner_id uuid;
  v_project_entity_id uuid;
begin
  if _user_id is null then return false; end if;

  -- Phase 25: the integrations module is platform-operations only (module AND action matched).
  if _module = 'integrations'::public.app_module then
    return _action = any (array['view','create','update','execute']::public.app_action[])
       and private.is_platform_staff(_user_id);
  end if;

  if _project_id is not null then
    select p.owner_id, p.entity_id into v_owner_id, v_project_entity_id
    from public.projects p where p.id = _project_id and p.deleted_at is null;
    if v_owner_id is null then return false; end if;
    v_entity_id := coalesce(v_project_entity_id, v_entity_id);
    if v_owner_id = _user_id then return true; end if;
  end if;

  if exists (
    select 1 from public.permission_grants g
    where g.subject_user_id = _user_id and g.module = _module and g.action = _action
      and g.effect = 'deny' and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and ((g.scope_type = 'project' and g.scope_project_id = _project_id)
        or (g.scope_type = 'entity' and g.scope_entity_id = v_entity_id))
  ) then return false; end if;

  if _project_id is not null and _action = 'view'::public.app_action and private.is_platform_staff(_user_id) then
    if exists (
      select 1 from public.platform_case_access ca
      join public.permission_grants g on g.id = ca.grant_id
      where ca.staff_user_id = _user_id and ca.project_id = _project_id
        and ca.revoked_at is null and ca.expires_at > now()
        and g.revoked_at is null and g.effect = 'allow' and g.module = _module and g.action = _action
        and (g.expires_at is null or g.expires_at > now())
    ) then return true; end if;

    if exists (
      select 1 from public.platform_breakglass_requests b
      join public.permission_grants g on g.id = b.grant_id
      where b.requested_by = _user_id and b.project_id = _project_id
        and b.status = 'approved' and b.expires_at > now()
        and g.revoked_at is null and g.effect = 'allow' and g.module = _module and g.action = _action
        and (g.expires_at is null or g.expires_at > now())
    ) then return true; end if;
  end if;

  if _module = any (array['marketing','media']::public.app_module[])
     and _project_id is not null
     and _action = any (array['view','create','update']::public.app_action[])
  then
    if exists (
      select 1
      from public.marketing_contracts mc
      join public.marketing_profiles mp on mp.id = mc.profile_id
      join public.entity_memberships em
        on em.entity_id = mc.marketer_entity_id
       and em.user_id = _user_id and em.status = 'active'
       and (em.expires_at is null or em.expires_at > now())
      where mp.project_id = _project_id and mc.status = 'active'
        and mc.starts_on <= current_date
        and (mc.ends_on is null or mc.ends_on >= current_date)
    ) then return true; end if;
  end if;

  if _module = 'media'::public.app_module
     and _project_id is not null
     and _action = any (array['view','create','update']::public.app_action[])
     and private.is_media_photographer(_user_id, _project_id)
  then
    return true;
  end if;

  if _project_id is not null and private.party_ceiling(_user_id, _module, _action, _project_id) then
    return true;
  end if;

  if v_entity_id is null then return false; end if;

  if exists (
    select 1 from public.entity_memberships em
    join public.role_permissions rp on rp.role = em.role
    where em.user_id = _user_id and em.entity_id = v_entity_id and em.status = 'active'
      and (em.expires_at is null or em.expires_at > now())
      and rp.module = _module and rp.action = _action
      and (_project_id is null or em.role in ('owner'::public.app_role,'admin'::public.app_role,'manager'::public.app_role))
  ) then return true; end if;

  if _project_id is not null and private.has_project_assignment(_user_id, _project_id) then
    if exists (
      select 1 from public.project_assignments a
      join public.entity_memberships em
        on em.user_id = a.user_id and em.entity_id = coalesce(a.entity_id, v_entity_id) and em.status = 'active'
      join public.role_permissions rp on rp.role = em.role
      where a.user_id = _user_id and a.project_id = _project_id and a.status = 'active'
        and a.deleted_at is null and rp.module = _module and rp.action = _action
    ) then return true; end if;
  end if;

  return exists (
    select 1 from public.permission_grants g
    where g.subject_user_id = _user_id and g.module = _module and g.action = _action
      and g.effect = 'allow' and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and not exists (select 1 from public.platform_case_access ca where ca.grant_id = g.id)
      and not exists (select 1 from public.platform_breakglass_requests b where b.grant_id = g.id)
      and ((g.scope_type = 'project' and g.scope_project_id = _project_id)
        or (g.scope_type = 'entity' and g.scope_entity_id = v_entity_id))
  );
end $$;

revoke execute on function private.can(uuid, public.app_module, public.app_action, uuid, uuid) from public, anon;
grant execute on function private.can(uuid, public.app_module, public.app_action, uuid, uuid) to authenticated;