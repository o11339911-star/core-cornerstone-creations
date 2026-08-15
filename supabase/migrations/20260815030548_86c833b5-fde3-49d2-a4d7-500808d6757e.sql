-- =========================================================
-- Phase 6: entity teams, invitations, assignments, visibility
-- =========================================================

create type public.visibility_level as enum ('internal', 'limited', 'project_wide');

-- ---------- 1) entity_invitations ----------
create table public.entity_invitations (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'member',
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz not null default now() + interval '7 days',
  invited_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_invitations_status_chk
    check (status in ('pending','accepted','expired','revoked'))
);

create unique index entity_invitations_one_pending
  on public.entity_invitations (entity_id, lower(email))
  where status = 'pending';
create index idx_entity_invitations_entity on public.entity_invitations(entity_id);

grant select, insert, update on public.entity_invitations to authenticated;
grant all on public.entity_invitations to service_role;
alter table public.entity_invitations enable row level security;

create policy entity_invitations_select_manager on public.entity_invitations
  for select to authenticated
  using (private.can((select auth.uid()), 'members', 'manage_members', entity_id, null));

create policy entity_invitations_insert_manager on public.entity_invitations
  for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and private.can((select auth.uid()), 'members', 'manage_members', entity_id, null)
  );

create policy entity_invitations_update_manager on public.entity_invitations
  for update to authenticated
  using (private.can((select auth.uid()), 'members', 'manage_members', entity_id, null))
  with check (private.can((select auth.uid()), 'members', 'manage_members', entity_id, null));

create trigger entity_invitations_set_updated_at
  before update on public.entity_invitations
  for each row execute function public.set_updated_at();

-- ---------- 2) project_assignments ----------
create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid references public.project_stages(id) on delete set null,
  user_id uuid not null references auth.users(id),
  entity_id uuid references public.entities(id) on delete set null,
  job_title_ar text not null,
  job_title_en text not null,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active',
  visibility public.visibility_level not null default 'internal',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint project_assignments_status_chk
    check (status in ('active','ended','transferred'))
);

create index idx_project_assignments_project on public.project_assignments(project_id);
create index idx_project_assignments_user on public.project_assignments(user_id);
create index idx_project_assignments_entity on public.project_assignments(entity_id);

grant select, insert, update on public.project_assignments to authenticated;
grant all on public.project_assignments to service_role;
alter table public.project_assignments enable row level security;

create trigger project_assignments_set_updated_at
  before update on public.project_assignments
  for each row execute function public.set_updated_at();

-- ---------- 3) assignment_visibility_audience ----------
create table public.assignment_visibility_audience (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.project_assignments(id) on delete cascade,
  audience_user_id uuid references auth.users(id),
  audience_entity_id uuid references public.entities(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint audience_one_subject check (
    (audience_user_id is not null and audience_entity_id is null)
    or (audience_user_id is null and audience_entity_id is not null)
  )
);
create index idx_audience_assignment on public.assignment_visibility_audience(assignment_id);

grant select, insert, update on public.assignment_visibility_audience to authenticated;
grant all on public.assignment_visibility_audience to service_role;
alter table public.assignment_visibility_audience enable row level security;

-- ---------- 4) assignment_transfers (append-only) ----------
create table public.assignment_transfers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_assignment_id uuid not null references public.project_assignments(id),
  to_assignment_id uuid references public.project_assignments(id),
  from_user_id uuid not null,
  to_user_id uuid,
  reason text,
  transferred_by uuid not null,
  created_at timestamptz not null default now()
);
create index idx_assignment_transfers_project on public.assignment_transfers(project_id);

grant select on public.assignment_transfers to authenticated;
grant all on public.assignment_transfers to service_role;
alter table public.assignment_transfers enable row level security;

create policy assignment_transfers_select_scope on public.assignment_transfers
  for select to authenticated
  using (private.can_access_project((select auth.uid()), project_id));

-- ---------- 5) permission helpers ----------
create or replace function private.has_project_assignment(_user_id uuid, _project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_assignments a
    where a.user_id = _user_id
      and a.project_id = _project_id
      and a.status = 'active'
      and a.deleted_at is null
      and a.starts_on <= current_date
      and (a.ends_on is null or a.ends_on >= current_date)
  );
$$;

revoke all on function private.has_project_assignment(uuid, uuid) from public;
grant execute on function private.has_project_assignment(uuid, uuid) to authenticated, service_role;

-- extend the decision engine: an active assignment is a project-scoped source of truth
create or replace function private.can(
  _user_id uuid,
  _module public.app_module,
  _action public.app_action,
  _entity_id uuid default null,
  _project_id uuid default null
) returns boolean
language plpgsql stable security definer set search_path = public
as $$
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
$$;

revoke all on function private.can(uuid, public.app_module, public.app_action, uuid, uuid) from public;
grant execute on function private.can(uuid, public.app_module, public.app_action, uuid, uuid) to authenticated, service_role;

-- entity membership alone no longer opens every entity project:
-- only privileged roles keep entity-wide reach; everyone else needs an assignment.
create or replace function private.can_access_project(_user_id uuid, _project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = _project_id
      and p.deleted_at is null
      and (
        p.owner_id = _user_id
        or (
          p.entity_id is not null
          and (
            private.has_role(_user_id, p.entity_id, 'owner')
            or private.has_role(_user_id, p.entity_id, 'admin')
            or private.has_role(_user_id, p.entity_id, 'manager')
          )
        )
      )
  )
  or private.has_project_assignment(_user_id, _project_id)
  or private.can(_user_id, 'projects'::public.app_module, 'view'::public.app_action, null, _project_id);
$$;

revoke all on function private.can_access_project(uuid, uuid) from public;
grant execute on function private.can_access_project(uuid, uuid) to authenticated, service_role;

-- align the projects SELECT policy with the same rule
drop policy if exists projects_select_scope on public.projects;
create policy projects_select_scope on public.projects
  for select to authenticated
  using (deleted_at is null and private.can_access_project((select auth.uid()), id));

-- ---------- 6) assignment RLS ----------
create policy project_assignments_select_scope on public.project_assignments
  for select to authenticated
  using (
    deleted_at is null
    and (
      user_id = (select auth.uid())
      or private.can_access_project((select auth.uid()), project_id)
    )
  );

create policy project_assignments_insert_scope on public.project_assignments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.can((select auth.uid()), 'projects', 'update', null, project_id)
  );

create policy project_assignments_update_scope on public.project_assignments
  for update to authenticated
  using (private.can((select auth.uid()), 'projects', 'update', null, project_id))
  with check (private.can((select auth.uid()), 'projects', 'update', null, project_id));

create policy audience_select_scope on public.assignment_visibility_audience
  for select to authenticated
  using (exists (
    select 1 from public.project_assignments a
    where a.id = assignment_id
      and (a.user_id = (select auth.uid())
           or private.can_access_project((select auth.uid()), a.project_id))
  ));

create policy audience_insert_scope on public.assignment_visibility_audience
  for insert to authenticated
  with check (exists (
    select 1 from public.project_assignments a
    where a.id = assignment_id
      and private.can((select auth.uid()), 'projects', 'update', null, a.project_id)
  ));

create policy audience_update_scope on public.assignment_visibility_audience
  for update to authenticated
  using (exists (
    select 1 from public.project_assignments a
    where a.id = assignment_id
      and private.can((select auth.uid()), 'projects', 'update', null, a.project_id)
  ))
  with check (exists (
    select 1 from public.project_assignments a
    where a.id = assignment_id
      and private.can((select auth.uid()), 'projects', 'update', null, a.project_id)
  ));

-- ---------- 7) visibility resolution ----------
create or replace function private.can_see_assignee(_viewer uuid, _assignment_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_assignments a
    where a.id = _assignment_id
      and (
        a.user_id = _viewer
        or a.visibility = 'project_wide'
        or (a.visibility = 'internal' and a.entity_id is not null
            and private.is_entity_member(_viewer, a.entity_id))
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
$$;

revoke all on function private.can_see_assignee(uuid, uuid) from public;
grant execute on function private.can_see_assignee(uuid, uuid) to authenticated, service_role;

create or replace function private.assignee_display(_viewer uuid, _assignment_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when private.can_see_assignee(_viewer, _assignment_id)
      then coalesce(pr.full_name, a.job_title_ar)
    else coalesce(e.name || ' — ', '') || a.job_title_ar
  end
  from public.project_assignments a
  left join public.profiles pr on pr.id = a.user_id
  left join public.entities e on e.id = a.entity_id
  where a.id = _assignment_id;
$$;

revoke all on function private.assignee_display(uuid, uuid) from public;
grant execute on function private.assignee_display(uuid, uuid) to authenticated, service_role;

create view public.project_assignments_public
with (security_invoker = true) as
select
  a.id,
  a.project_id,
  a.stage_id,
  a.entity_id,
  a.job_title_ar,
  a.job_title_en,
  a.starts_on,
  a.ends_on,
  a.status,
  a.visibility,
  case when private.can_see_assignee((select auth.uid()), a.id) then a.user_id end as user_id,
  private.assignee_display((select auth.uid()), a.id) as display_name,
  private.can_see_assignee((select auth.uid()), a.id) as is_identified
from public.project_assignments a
where a.deleted_at is null;

grant select on public.project_assignments_public to authenticated;

-- ---------- 8) invitation acceptance ----------
create or replace function public.accept_entity_invitation(_token text)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.entity_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  select * into v_inv
  from public.entity_invitations
  where token_hash = encode(sha256(convert_to(_token, 'utf8')), 'hex')
  for update;

  if v_inv.id is null then
    raise exception 'Invitation not found' using errcode = '22023';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'Invitation is % and cannot be accepted', v_inv.status using errcode = '22023';
  end if;

  if v_inv.expires_at <= now() then
    update public.entity_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;

  if lower(v_inv.email) <> v_email then
    raise exception 'Invitation was issued to a different email' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.entity_memberships
    where user_id = v_uid and entity_id = v_inv.entity_id
  ) then
    update public.entity_invitations
      set status = 'accepted', accepted_by = v_uid, accepted_at = now()
      where id = v_inv.id;
    raise exception 'You are already a member of this entity' using errcode = '23505';
  end if;

  insert into public.entity_memberships (user_id, entity_id, role, status, invited_by)
  values (v_uid, v_inv.entity_id, v_inv.role, 'active', v_inv.invited_by);

  update public.entity_invitations
    set status = 'accepted', accepted_by = v_uid, accepted_at = now()
    where id = v_inv.id;

  return v_inv.entity_id;
end;
$$;

revoke all on function public.accept_entity_invitation(text) from public;
grant execute on function public.accept_entity_invitation(text) to authenticated;

-- unique membership per (user, entity)
create unique index if not exists entity_memberships_user_entity_uniq
  on public.entity_memberships(user_id, entity_id);

-- ---------- 9) offboarding ----------
create or replace function public.offboard_member(
  _entity_id uuid,
  _user_id uuid,
  _replacement_user_id uuid default null,
  _reason text default null
) returns integer
language plpgsql volatile security definer set search_path = public
as $$
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

  -- 1) immediate access revocation (never a delete)
  update public.entity_memberships
    set status = 'inactive'
    where user_id = _user_id and entity_id = _entity_id;

  -- 2) revoke live fine-grained grants in this entity scope
  update public.permission_grants
    set revoked_at = now()
    where subject_user_id = _user_id
      and scope_entity_id = _entity_id
      and revoked_at is null;

  -- 3) hand over open assignments
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
$$;

revoke all on function public.offboard_member(uuid, uuid, uuid, text) from public;
grant execute on function public.offboard_member(uuid, uuid, uuid, text) to authenticated;

-- ---------- 10) invitation token issuance ----------
create or replace function public.create_entity_invitation(
  _entity_id uuid,
  _email text,
  _role public.app_role default 'member',
  _valid_days integer default 7
) returns table (invitation_id uuid, token text)
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_token text;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.can(v_actor, 'members', 'manage_members', _entity_id, null) then
    raise exception 'Not allowed to invite members to this entity' using errcode = '42501';
  end if;
  if _role = 'owner' and not private.has_role(v_actor, _entity_id, 'owner') then
    raise exception 'Only an owner can invite another owner' using errcode = '42501';
  end if;

  -- expire stale pending invitations for this entity first
  update public.entity_invitations
    set status = 'expired'
    where entity_id = _entity_id and status = 'pending' and expires_at <= now();

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.entity_invitations
    (entity_id, email, role, token_hash, expires_at, invited_by)
  values
    (_entity_id, lower(_email), _role,
     encode(sha256(convert_to(v_token, 'utf8')), 'hex'),
     now() + make_interval(days => greatest(_valid_days, 1)),
     v_actor)
  returning id into v_id;

  return query select v_id, v_token;
end;
$$;

revoke all on function public.create_entity_invitation(uuid, text, public.app_role, integer) from public;
grant execute on function public.create_entity_invitation(uuid, text, public.app_role, integer) to authenticated;
