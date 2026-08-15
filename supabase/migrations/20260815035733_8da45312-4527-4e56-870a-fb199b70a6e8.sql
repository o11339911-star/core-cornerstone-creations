-- 1. enum
create type public.project_party_role as enum (
  'design_office','supervision','contractor','inspector','insurance','accounting','legal','supplier'
);

-- 2. project_parties
create table public.project_parties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  party_entity_id uuid not null references public.entities(id) on delete restrict,
  party_role public.project_party_role not null,
  scope_text_ar text,
  scope_text_en text,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'invited'
    check (status in ('invited','accepted','rejected','ended','cancelled')),
  invited_by uuid not null references auth.users(id),
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index project_parties_active_unique
  on public.project_parties(project_id, party_entity_id, party_role)
  where status in ('invited','accepted');

create index project_parties_entity_idx on public.project_parties(party_entity_id, status);
create index project_parties_project_idx on public.project_parties(project_id, status);

grant select on public.project_parties to authenticated;
grant all on public.project_parties to service_role;
alter table public.project_parties enable row level security;

create policy project_parties_select on public.project_parties
  for select to authenticated
  using (
    private.can_access_project((select auth.uid()), project_id)
    or private.is_entity_member((select auth.uid()), party_entity_id)
  );

create trigger project_parties_set_updated_at
  before update on public.project_parties
  for each row execute function public.set_updated_at();

-- 3. project_party_stages
create table public.project_party_stages (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.project_parties(id) on delete cascade,
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (party_id, stage_id)
);

grant select on public.project_party_stages to authenticated;
grant all on public.project_party_stages to service_role;
alter table public.project_party_stages enable row level security;

create policy project_party_stages_select on public.project_party_stages
  for select to authenticated
  using (exists (
    select 1 from public.project_parties p
    where p.id = party_id
      and (private.can_access_project((select auth.uid()), p.project_id)
           or private.is_entity_member((select auth.uid()), p.party_entity_id))
  ));

-- 4. project_party_permissions (link to permission_grants)
create table public.project_party_permissions (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.project_parties(id) on delete cascade,
  grant_id uuid not null references public.permission_grants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (party_id, grant_id)
);

grant select on public.project_party_permissions to authenticated;
grant all on public.project_party_permissions to service_role;
alter table public.project_party_permissions enable row level security;

create policy project_party_permissions_select on public.project_party_permissions
  for select to authenticated
  using (exists (
    select 1 from public.project_parties p
    where p.id = party_id
      and (private.can_access_project((select auth.uid()), p.project_id)
           or private.is_entity_member((select auth.uid()), p.party_entity_id))
  ));

-- 5. audit trigger for parties
create or replace function public.audit_project_party_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.permission_audit_log(
    actor_user_id, target_entity_id, target_project_id, object_type, object_id, action, old_value, new_value)
  values (
    auth.uid(),
    coalesce(new.party_entity_id, old.party_entity_id),
    coalesce(new.project_id, old.project_id),
    'project_party',
    coalesce(new.id, old.id),
    case tg_op when 'INSERT' then 'insert' when 'UPDATE' then 'update' else 'delete' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger project_parties_audit
  after insert or update or delete on public.project_parties
  for each row execute function public.audit_project_party_change();

-- 6. helpers
create or replace function private.accepted_party_entity(_user_id uuid, _project_id uuid)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $$
  select pp.party_entity_id
  from public.project_parties pp
  where pp.project_id = _project_id
    and pp.status = 'accepted'
    and (pp.ends_on is null or pp.ends_on >= current_date)
    and private.is_entity_member(_user_id, pp.party_entity_id)
  limit 1;
$$;

create or replace function private.is_project_insider(_user_id uuid, _project_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.projects p
    where p.id = _project_id
      and p.deleted_at is null
      and (
        p.owner_id = _user_id
        or (p.entity_id is not null and private.is_entity_member(_user_id, p.entity_id))
      )
  );
$$;

-- external party member's ceiling for a project
create or replace function private.party_ceiling(
  _user_id uuid, _module app_module, _action app_action, _project_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.project_parties pp
    join public.entity_memberships em
      on em.entity_id = pp.party_entity_id
     and em.user_id = _user_id
     and em.status = 'active'
     and (em.expires_at is null or em.expires_at > now())
    join public.role_permissions rp
      on rp.role = em.role and rp.module = _module and rp.action = _action
    where pp.project_id = _project_id
      and pp.status = 'accepted'
      and (pp.ends_on is null or pp.ends_on >= current_date)
      and private.entity_ceiling(pp.party_entity_id, _project_id, _module, _action)
  );
$$;

-- stage visibility for external parties
create or replace function private.stage_in_scope(_user_id uuid, _stage_id uuid, _project_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select private.is_project_insider(_user_id, _project_id)
     or private.accepted_party_entity(_user_id, _project_id) is null
     or exists (
          select 1
          from public.project_party_stages ps
          join public.project_parties pp on pp.id = ps.party_id
          where ps.stage_id = _stage_id
            and pp.project_id = _project_id
            and pp.status = 'accepted'
            and private.is_entity_member(_user_id, pp.party_entity_id)
        );
$$;

revoke all on function private.accepted_party_entity(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_project_insider(uuid, uuid) from public, anon, authenticated;
revoke all on function private.party_ceiling(uuid, app_module, app_action, uuid) from public, anon, authenticated;
revoke all on function private.stage_in_scope(uuid, uuid, uuid) from public, anon, authenticated;

-- 7. extend the phase-5 engine (no parallel system)
create or replace function private.can(
  _user_id uuid, _module app_module, _action app_action,
  _entity_id uuid default null, _project_id uuid default null)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
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

  -- explicit deny always wins (project scope can be evaluated without an entity)
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

  -- external party path: accepted party entity ceiling ∩ member's role
  if _project_id is not null and private.party_ceiling(_user_id, _module, _action, _project_id) then
    return true;
  end if;

  if v_entity_id is null then
    return false;
  end if;

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

-- 8. stage isolation for external parties
drop policy project_stages_select_scope on public.project_stages;
create policy project_stages_select_scope on public.project_stages
  for select to authenticated
  using (
    deleted_at is null
    and private.can_access_project((select auth.uid()), project_id)
    and private.stage_in_scope((select auth.uid()), id, project_id)
  );

-- 9. assignment guard: party managers may only assign their own members, inside scope
create or replace function public.enforce_assignment_party_scope()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_party public.project_parties%rowtype;
begin
  if v_actor is null then
    return new; -- service_role / server-side path
  end if;

  if new.entity_id is not null then
    select * into v_party
    from public.project_parties
    where project_id = new.project_id
      and party_entity_id = new.entity_id
      and status = 'accepted'
      and (ends_on is null or ends_on >= current_date)
    limit 1;
  end if;

  -- actor is not an insider of the project: they must act as a party manager
  if not private.is_project_insider(v_actor, new.project_id)
     and (select owner_id from public.projects where id = new.project_id) <> v_actor then
    if v_party.id is null then
      raise exception 'Only an accepted project party can assign members here'
        using errcode = '42501';
    end if;
    if not (private.has_role(v_actor, v_party.party_entity_id, 'owner')
         or private.has_role(v_actor, v_party.party_entity_id, 'admin')
         or private.has_role(v_actor, v_party.party_entity_id, 'manager')) then
      raise exception 'Only a manager of the party entity can assign its members'
        using errcode = '42501';
    end if;
  end if;

  if v_party.id is not null then
    if not private.is_entity_member(new.user_id, v_party.party_entity_id) then
      raise exception 'Assignee must be an active member of the party entity'
        using errcode = '42501';
    end if;
    if new.stage_id is not null and not exists (
      select 1 from public.project_party_stages ps
      where ps.party_id = v_party.id and ps.stage_id = new.stage_id
    ) then
      raise exception 'Stage is outside the scope agreed with this party'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger project_assignments_party_scope
  before insert or update on public.project_assignments
  for each row execute function public.enforce_assignment_party_scope();

-- 10. lifecycle RPCs
create or replace function public.invite_project_party(
  _project_id uuid,
  _party_entity_id uuid,
  _party_role public.project_party_role,
  _scope_text_ar text default null,
  _scope_text_en text default null,
  _starts_on date default current_date,
  _ends_on date default null,
  _stage_ids uuid[] default '{}',
  _permissions jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.projects%rowtype;
  v_party_id uuid;
  v_grant_id uuid;
  v_perm jsonb;
  v_stage uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_project from public.projects where id = _project_id and deleted_at is null;
  if v_project.id is null then
    raise exception 'Project not found' using errcode = '22023';
  end if;

  if v_project.owner_id <> v_actor
     and not private.can(v_actor, 'members', 'manage_members', v_project.entity_id, _project_id) then
    raise exception 'Not allowed to manage parties of this project' using errcode = '42501';
  end if;

  if v_project.entity_id is not null and v_project.entity_id = _party_entity_id then
    raise exception 'The owning entity cannot be invited as an external party' using errcode = '22023';
  end if;

  insert into public.project_parties
    (project_id, party_entity_id, party_role, scope_text_ar, scope_text_en,
     starts_on, ends_on, status, invited_by)
  values
    (_project_id, _party_entity_id, _party_role, _scope_text_ar, _scope_text_en,
     coalesce(_starts_on, current_date), _ends_on, 'invited', v_actor)
  returning id into v_party_id;

  foreach v_stage in array coalesce(_stage_ids, '{}')
  loop
    if not exists (select 1 from public.project_stages s
                   where s.id = v_stage and s.project_id = _project_id and s.deleted_at is null) then
      raise exception 'Stage does not belong to this project' using errcode = '22023';
    end if;
    insert into public.project_party_stages(party_id, stage_id)
    values (v_party_id, v_stage)
    on conflict do nothing;
  end loop;

  for v_perm in select * from jsonb_array_elements(coalesce(_permissions, '[]'::jsonb))
  loop
    insert into public.permission_grants
      (subject_entity_id, scope_type, scope_project_id, module, action, effect, granted_by)
    values
      (_party_entity_id, 'project', _project_id,
       (v_perm ->> 'module')::public.app_module,
       (v_perm ->> 'action')::public.app_action,
       'allow', v_actor)
    returning id into v_grant_id;

    insert into public.project_party_permissions(party_id, grant_id)
    values (v_party_id, v_grant_id);
  end loop;

  return v_party_id;
end;
$$;

create or replace function public.respond_to_project_party(_party_id uuid, _accept boolean)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_party public.project_parties%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_party from public.project_parties where id = _party_id for update;
  if v_party.id is null then
    raise exception 'Party invitation not found' using errcode = '22023';
  end if;
  if v_party.status <> 'invited' then
    raise exception 'Invitation is % and cannot be answered', v_party.status using errcode = '22023';
  end if;
  if not (private.has_role(v_actor, v_party.party_entity_id, 'owner')
       or private.has_role(v_actor, v_party.party_entity_id, 'admin')) then
    raise exception 'Only an owner or admin of the invited entity can answer' using errcode = '42501';
  end if;

  update public.project_parties
    set status = case when _accept then 'accepted' else 'rejected' end,
        responded_by = v_actor,
        responded_at = now()
    where id = _party_id;

  return case when _accept then 'accepted' else 'rejected' end;
end;
$$;

create or replace function public.end_project_party(_party_id uuid, _reason text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_party public.project_parties%rowtype;
  v_project public.projects%rowtype;
  v_a record;
  v_moved int := 0;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_party from public.project_parties where id = _party_id for update;
  if v_party.id is null then
    raise exception 'Party not found' using errcode = '22023';
  end if;
  if v_party.status in ('ended','cancelled','rejected') then
    raise exception 'Party is already %', v_party.status using errcode = '22023';
  end if;

  select * into v_project from public.projects where id = v_party.project_id;

  if v_project.owner_id <> v_actor
     and not private.can(v_actor, 'members', 'manage_members', v_project.entity_id, v_project.id)
     and not (private.has_role(v_actor, v_party.party_entity_id, 'owner')
           or private.has_role(v_actor, v_party.party_entity_id, 'admin')) then
    raise exception 'Not allowed to end this party' using errcode = '42501';
  end if;

  update public.project_parties
    set status = case when v_party.status = 'invited' then 'cancelled' else 'ended' end,
        ended_at = now(),
        end_reason = _reason,
        ends_on = coalesce(ends_on, current_date)
    where id = _party_id;

  update public.permission_grants g
    set revoked_at = now()
    where g.revoked_at is null
      and g.id in (select grant_id from public.project_party_permissions where party_id = _party_id);

  for v_a in
    select * from public.project_assignments
    where project_id = v_party.project_id
      and entity_id = v_party.party_entity_id
      and status = 'active'
      and deleted_at is null
  loop
    update public.project_assignments
      set status = 'ended', ends_on = current_date
      where id = v_a.id;

    insert into public.assignment_transfers
      (project_id, from_assignment_id, to_assignment_id, from_user_id, to_user_id, reason, transferred_by)
    values
      (v_party.project_id, v_a.id, null, v_a.user_id, null,
       coalesce(_reason, 'project party ended'), v_actor);

    v_moved := v_moved + 1;
  end loop;

  return v_moved;
end;
$$;

revoke all on function public.invite_project_party(uuid, uuid, public.project_party_role, text, text, date, date, uuid[], jsonb) from public, anon;
revoke all on function public.respond_to_project_party(uuid, boolean) from public, anon;
revoke all on function public.end_project_party(uuid, text) from public, anon;
grant execute on function public.invite_project_party(uuid, uuid, public.project_party_role, text, text, date, date, uuid[], jsonb) to authenticated;
grant execute on function public.respond_to_project_party(uuid, boolean) to authenticated;
grant execute on function public.end_project_party(uuid, text) to authenticated;