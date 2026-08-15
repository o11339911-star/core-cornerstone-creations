-- =========================================================
-- Phase 5 — Permission engine
-- =========================================================

create type public.app_action as enum (
  'view','create','update','soft_delete','approve','execute','export','share','manage_members'
);

create type public.app_module as enum (
  'projects','stages','contracts','documents','finance','correspondence','reports','members'
);

-- ---------------------------------------------------------
-- 1. role_permissions (reference matrix)
-- ---------------------------------------------------------
create table public.role_permissions (
  role public.app_role not null,
  module public.app_module not null,
  action public.app_action not null,
  created_at timestamptz not null default now(),
  primary key (role, module, action)
);

grant select on public.role_permissions to authenticated;
grant all on public.role_permissions to service_role;

alter table public.role_permissions enable row level security;

create policy role_permissions_select_authenticated
  on public.role_permissions for select to authenticated using (true);

-- Seed: owner = everything
insert into public.role_permissions (role, module, action)
select 'owner'::public.app_role, m, a
from unnest(enum_range(null::public.app_module)) m
cross join unnest(enum_range(null::public.app_action)) a;

-- admin = everything except finance approve
insert into public.role_permissions (role, module, action)
select 'admin'::public.app_role, m, a
from unnest(enum_range(null::public.app_module)) m
cross join unnest(enum_range(null::public.app_action)) a
where not (m = 'finance' and a = 'approve');

-- manager
insert into public.role_permissions (role, module, action)
select 'manager'::public.app_role, m, a
from unnest(array['projects','stages','documents','reports','correspondence']::public.app_module[]) m
cross join unnest(array['view','create','update','soft_delete','execute','export','share']::public.app_action[]) a;

insert into public.role_permissions (role, module, action)
values ('manager','members','view'),
       ('manager','contracts','view'),
       ('manager','finance','view');

-- member
insert into public.role_permissions (role, module, action)
select 'member'::public.app_role, m, a
from unnest(array['projects','stages','documents']::public.app_module[]) m
cross join unnest(array['view','create','update']::public.app_action[]) a;

insert into public.role_permissions (role, module, action)
values ('member','reports','view'),
       ('member','correspondence','view'),
       ('member','members','view');

-- viewer
insert into public.role_permissions (role, module, action)
select 'viewer'::public.app_role, m, a
from unnest(array['projects','stages','documents','reports','correspondence','contracts']::public.app_module[]) m
cross join unnest(array['view','export']::public.app_action[]) a;

-- ---------------------------------------------------------
-- 2. permission_grants (fine-grained overrides)
-- ---------------------------------------------------------
create table public.permission_grants (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid references auth.users(id) on delete cascade,
  subject_entity_id uuid references public.entities(id) on delete cascade,
  scope_type text not null,
  scope_entity_id uuid references public.entities(id) on delete cascade,
  scope_project_id uuid references public.projects(id) on delete cascade,
  module public.app_module not null,
  action public.app_action not null,
  effect text not null default 'allow',
  granted_by uuid not null references auth.users(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permission_grants_subject_ck
    check (num_nonnulls(subject_user_id, subject_entity_id) = 1),
  constraint permission_grants_scope_type_ck
    check (scope_type in ('entity','project')),
  constraint permission_grants_scope_ck
    check (
      (scope_type = 'entity'  and scope_entity_id is not null and scope_project_id is null)
      or
      (scope_type = 'project' and scope_project_id is not null)
    ),
  constraint permission_grants_effect_ck check (effect in ('allow','deny'))
);

create index idx_permission_grants_subject_user on public.permission_grants(subject_user_id);
create index idx_permission_grants_subject_entity on public.permission_grants(subject_entity_id);
create index idx_permission_grants_scope_entity on public.permission_grants(scope_entity_id);
create index idx_permission_grants_scope_project on public.permission_grants(scope_project_id);

grant select, insert, update on public.permission_grants to authenticated;
grant all on public.permission_grants to service_role;

alter table public.permission_grants enable row level security;

create trigger permission_grants_set_updated_at
  before update on public.permission_grants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- 3. permission_audit_log (append-only, trigger-written)
-- ---------------------------------------------------------
create table public.permission_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  target_user_id uuid,
  target_entity_id uuid,
  target_project_id uuid,
  object_type text not null,
  object_id uuid,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now(),
  constraint permission_audit_object_type_ck check (object_type in ('membership','grant')),
  constraint permission_audit_action_ck check (action in ('insert','update','revoke','delete'))
);

create index idx_permission_audit_entity on public.permission_audit_log(target_entity_id);
create index idx_permission_audit_target_user on public.permission_audit_log(target_user_id);

-- append-only: no insert/update/delete for client roles
grant select on public.permission_audit_log to authenticated;
grant select, insert on public.permission_audit_log to service_role;

alter table public.permission_audit_log enable row level security;

-- ---------------------------------------------------------
-- 4. Decision functions
-- ---------------------------------------------------------

-- Ceiling: what has been granted to an entity itself on this scope.
create or replace function private.entity_ceiling(
  _entity_id uuid,
  _project_id uuid,
  _module public.app_module,
  _action public.app_action
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.permission_grants g
    where g.subject_entity_id = _entity_id
      and g.module = _module
      and g.action = _action
      and g.effect = 'allow'
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and (
        (g.scope_type = 'project' and g.scope_project_id = _project_id)
        or (g.scope_type = 'entity' and g.scope_entity_id = _entity_id)
      )
  );
$$;

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
      return false; -- unknown/deleted project
    end if;

    -- project owner has full control over their own project
    if v_owner_id = _user_id then
      return true;
    end if;
  end if;

  if v_entity_id is null then
    return false; -- deny by default: no scope
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

  -- role-based permission inside the entity
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
  ) then
    return true;
  end if;

  -- explicit allow grant, capped by the granting entity ceiling for outsiders
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
$$;

grant usage on schema private to authenticated, service_role;
grant execute on function private.can(uuid, public.app_module, public.app_action, uuid, uuid) to authenticated, service_role;
grant execute on function private.entity_ceiling(uuid, uuid, public.app_module, public.app_action) to authenticated, service_role;

-- can_access_project rebuilt on top of the engine (non-breaking superset)
create or replace function private.can_access_project(_user_id uuid, _project_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = _project_id
      and p.deleted_at is null
      and (
        p.owner_id = _user_id
        or (p.entity_id is not null and private.is_entity_member(_user_id, p.entity_id))
      )
  )
  or private.can(_user_id, 'projects'::public.app_module, 'view'::public.app_action, null, _project_id);
$$;

-- ---------------------------------------------------------
-- 5. Guard + audit triggers
-- ---------------------------------------------------------

create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner_count int;
begin
  if tg_op = 'UPDATE' and new.user_id = auth.uid() and auth.uid() is not null then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.expires_at is distinct from old.expires_at then
      raise exception 'A member cannot change their own role, status or expiry'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' and old.user_id = auth.uid() and auth.uid() is not null then
    raise exception 'A member cannot remove their own membership' using errcode = '42501';
  end if;

  -- never leave an entity without an active owner
  if tg_op in ('UPDATE','DELETE') and old.role = 'owner' and old.status = 'active' then
    select count(*) into v_owner_count
    from public.entity_memberships em
    where em.entity_id = old.entity_id
      and em.role = 'owner'
      and em.status = 'active'
      and em.id <> old.id;

    if v_owner_count = 0 and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
      raise exception 'An entity must keep at least one active owner' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger entity_memberships_prevent_self_role_change
  before update or delete on public.entity_memberships
  for each row execute function public.prevent_self_role_change();

-- grants: granter cannot grant what they do not hold; outsiders capped by entity ceiling
create or replace function public.validate_permission_grant()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_scope_entity uuid;
begin
  if v_actor is null then
    return new; -- server-side/service_role path
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

  -- the granter must be able to share within this scope AND hold the action itself
  if not private.can(v_actor, new.module, 'share'::public.app_action, v_scope_entity, new.scope_project_id) then
    raise exception 'Not allowed to manage permissions in this scope' using errcode = '42501';
  end if;

  if new.effect = 'allow'
     and not private.can(v_actor, new.module, new.action, v_scope_entity, new.scope_project_id) then
    raise exception 'Cannot grant a permission the granter does not hold' using errcode = '42501';
  end if;

  -- outsider cap: subject belongs to another entity, not to the scope entity
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

  return new;
end;
$$;

create trigger permission_grants_validate
  before insert or update on public.permission_grants
  for each row execute function public.validate_permission_grant();

-- audit writers
create or replace function public.audit_membership_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.permission_audit_log(
    actor_user_id, target_user_id, target_entity_id, object_type, object_id, action, old_value, new_value)
  values (
    auth.uid(),
    coalesce(new.user_id, old.user_id),
    coalesce(new.entity_id, old.entity_id),
    'membership',
    coalesce(new.id, old.id),
    case tg_op when 'INSERT' then 'insert' when 'UPDATE' then 'update' else 'delete' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger entity_memberships_audit
  after insert or update or delete on public.entity_memberships
  for each row execute function public.audit_membership_change();

create or replace function public.audit_permission_grant_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.permission_audit_log(
    actor_user_id, target_user_id, target_entity_id, target_project_id,
    object_type, object_id, action, old_value, new_value)
  values (
    auth.uid(),
    coalesce(new.subject_user_id, old.subject_user_id),
    coalesce(new.scope_entity_id, old.scope_entity_id),
    coalesce(new.scope_project_id, old.scope_project_id),
    'grant',
    coalesce(new.id, old.id),
    case
      when tg_op = 'INSERT' then 'insert'
      when tg_op = 'UPDATE' and new.revoked_at is not null and old.revoked_at is null then 'revoke'
      when tg_op = 'UPDATE' then 'update'
      else 'delete'
    end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger permission_grants_audit
  after insert or update or delete on public.permission_grants
  for each row execute function public.audit_permission_grant_change();

-- ---------------------------------------------------------
-- 6. RLS policies for the new tables
-- ---------------------------------------------------------

create policy permission_grants_select_scope
  on public.permission_grants for select to authenticated
  using (
    subject_user_id = (select auth.uid())
    or private.can((select auth.uid()), module, 'share'::public.app_action, scope_entity_id, scope_project_id)
  );

create policy permission_grants_insert_scope
  on public.permission_grants for insert to authenticated
  with check (
    granted_by = (select auth.uid())
    and private.can((select auth.uid()), module, 'share'::public.app_action, scope_entity_id, scope_project_id)
  );

create policy permission_grants_update_scope
  on public.permission_grants for update to authenticated
  using (private.can((select auth.uid()), module, 'share'::public.app_action, scope_entity_id, scope_project_id))
  with check (private.can((select auth.uid()), module, 'share'::public.app_action, scope_entity_id, scope_project_id));

create policy permission_audit_log_select_scope
  on public.permission_audit_log for select to authenticated
  using (
    target_user_id = (select auth.uid())
    or private.can((select auth.uid()), 'members'::public.app_module, 'view'::public.app_action, target_entity_id, target_project_id)
  );

-- ---------------------------------------------------------
-- 7. Member management writes (first time), scoped to same entity
-- ---------------------------------------------------------
grant insert, update, delete on public.entity_memberships to authenticated;

create policy memberships_insert_manager
  on public.entity_memberships for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and user_id <> (select auth.uid())
    and private.can((select auth.uid()), 'members'::public.app_module, 'manage_members'::public.app_action, entity_id, null)
  );

create policy memberships_update_manager
  on public.entity_memberships for update to authenticated
  using (
    user_id <> (select auth.uid())
    and private.can((select auth.uid()), 'members'::public.app_module, 'manage_members'::public.app_action, entity_id, null)
  )
  with check (
    user_id <> (select auth.uid())
    and private.can((select auth.uid()), 'members'::public.app_module, 'manage_members'::public.app_action, entity_id, null)
  );

-- ---------------------------------------------------------
-- 8. Non-breaking extension of existing project policies
-- ---------------------------------------------------------
drop policy if exists projects_select_scope on public.projects;
create policy projects_select_scope
  on public.projects for select to authenticated
  using (
    deleted_at is null
    and (
      owner_id = (select auth.uid())
      or (entity_id is not null and private.is_entity_member((select auth.uid()), entity_id))
      or private.can((select auth.uid()), 'projects'::public.app_module, 'view'::public.app_action, entity_id, id)
    )
  );

drop policy if exists projects_update_scope on public.projects;
create policy projects_update_scope
  on public.projects for update to authenticated
  using (
    deleted_at is null
    and (
      owner_id = (select auth.uid())
      or private.can((select auth.uid()), 'projects'::public.app_module, 'update'::public.app_action, entity_id, id)
    )
  )
  with check (
    owner_id = (select auth.uid())
    or private.can((select auth.uid()), 'projects'::public.app_module, 'update'::public.app_action, entity_id, id)
  );