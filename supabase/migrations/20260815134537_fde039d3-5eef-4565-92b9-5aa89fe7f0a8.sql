-- ============ tables ============
create table public.media_shoot_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  requested_by uuid not null,
  photographer_entity_id uuid references public.entities(id) on delete set null,
  photographer_user_id uuid,
  status text not null default 'requested' check (status in ('requested','scheduled','in_progress','completed','cancelled')),
  scheduled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.media_shoot_requests(project_id);
create index on public.media_shoot_requests(photographer_user_id);

create table public.media_shoot_attendance (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.media_shoot_requests(id) on delete cascade,
  user_id uuid not null,
  checked_in_at timestamptz not null default now(),
  lat numeric(9,6),
  lng numeric(9,6),
  accuracy_m numeric(8,2),
  created_at timestamptz not null default now()
);
create index on public.media_shoot_attendance(shoot_id);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.media_shoot_requests(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null default 'panorama_360' check (kind in ('panorama_360','photo','video')),
  title text not null,
  raw_object_path text not null,
  blurred_object_path text,
  blur_ack_by uuid,
  blur_ack_at timestamptz,
  blur_ack_text text,
  status text not null default 'draft' check (status in ('draft','pending_review','review_approved','owner_approved','rejected','withdrawn')),
  submitted_by uuid,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.media_assets(project_id);
create index on public.media_assets(shoot_id);

create table public.media_asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  version_no int not null,
  object_path text not null,
  is_blurred boolean not null default false,
  checksum text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (asset_id, version_no)
);

create table public.media_publications (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  public_token text not null unique,
  public_object_path text not null,
  published_by uuid not null,
  published_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamptz not null default now()
);
create index on public.media_publications(asset_id);

-- ============ grants (read-only for clients; writes via guarded functions) ============
grant select on public.media_shoot_requests, public.media_shoot_attendance, public.media_assets, public.media_asset_versions, public.media_publications to authenticated;
grant all on public.media_shoot_requests, public.media_shoot_attendance, public.media_assets, public.media_asset_versions, public.media_publications to service_role;
revoke insert, update, delete, truncate on public.media_shoot_requests, public.media_shoot_attendance, public.media_assets, public.media_asset_versions, public.media_publications from anon, authenticated;
revoke select on public.media_shoot_requests, public.media_shoot_attendance, public.media_assets, public.media_asset_versions, public.media_publications from anon;

alter table public.media_shoot_requests enable row level security;
alter table public.media_shoot_attendance enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_asset_versions enable row level security;
alter table public.media_publications enable row level security;

-- ============ permission matrix ============
insert into public.role_permissions(role, module, action)
select r, 'media'::app_module, a
from unnest(array['owner','admin','manager']::app_role[]) r,
     unnest(array['view','create','update','approve','share']::app_action[]) a
on conflict do nothing;
insert into public.role_permissions(role, module, action)
select r, 'media'::app_module, a
from unnest(array['member']::app_role[]) r,
     unnest(array['view','create','update']::app_action[]) a
on conflict do nothing;
insert into public.role_permissions(role, module, action)
values ('viewer','media','view')
on conflict do nothing;

-- ============ helper ============
create or replace function private.is_media_photographer(_user_id uuid, _project_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.media_shoot_requests s
    where s.project_id = _project_id
      and s.status <> 'cancelled'
      and (
        s.photographer_user_id = _user_id
        or (s.photographer_entity_id is not null and exists (
              select 1 from public.entity_memberships em
              where em.entity_id = s.photographer_entity_id
                and em.user_id = _user_id
                and em.status = 'active'
                and (em.expires_at is null or em.expires_at > now())))
      )
  )
$$;

create or replace function private.can_see_media_asset(_user_id uuid, _asset_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.media_assets a
    where a.id = _asset_id
      and private.can(_user_id, 'media'::app_module, 'view'::app_action, null, a.project_id)
  )
$$;

-- ============ can(): media branch (module + action matched together) ============
create or replace function private.can(_user_id uuid, _module app_module, _action app_action, _entity_id uuid default null::uuid, _project_id uuid default null::uuid)
 returns boolean language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_entity_id uuid := _entity_id;
  v_owner_id uuid;
  v_project_entity_id uuid;
begin
  if _user_id is null then return false; end if;

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
end; $function$;

-- ============ RLS policies (read) ============
create policy media_shoots_select on public.media_shoot_requests for select to authenticated
using (private.can(auth.uid(), 'media'::app_module, 'view'::app_action, null, project_id));

create policy media_attendance_select on public.media_shoot_attendance for select to authenticated
using (exists (select 1 from public.media_shoot_requests s where s.id = shoot_id
  and private.can(auth.uid(), 'media'::app_module, 'view'::app_action, null, s.project_id)));

create policy media_assets_select on public.media_assets for select to authenticated
using (private.can(auth.uid(), 'media'::app_module, 'view'::app_action, null, project_id));

create policy media_versions_select on public.media_asset_versions for select to authenticated
using (private.can_see_media_asset(auth.uid(), asset_id));

create policy media_pubs_select on public.media_publications for select to authenticated
using (private.can(auth.uid(), 'media'::app_module, 'view'::app_action, null, project_id));

-- ============ append-only guards ============
create or replace function private.guard_media_append_only()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  raise exception 'MEDIA_APPEND_ONLY: % is append-only', tg_table_name;
end; $$;

create trigger media_versions_append_only before update or delete on public.media_asset_versions
for each row execute function private.guard_media_append_only();
create trigger media_attendance_append_only before update or delete on public.media_shoot_attendance
for each row execute function private.guard_media_append_only();

-- revoke publications when an asset leaves owner_approved
create or replace function private.sync_media_publications()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status is distinct from 'owner_approved' and old.status = 'owner_approved' then
    update public.media_publications
       set revoked_at = now(), revoked_by = auth.uid(),
           revoke_reason = coalesce(revoke_reason, 'APPROVAL_WITHDRAWN')
     where asset_id = new.id and revoked_at is null;
  end if;
  new.updated_at := now();
  return new;
end; $$;

create trigger media_assets_sync_pubs before update on public.media_assets
for each row execute function private.sync_media_publications();

create or replace function private.touch_media_updated_at()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger media_shoots_touch before update on public.media_shoot_requests
for each row execute function private.touch_media_updated_at();

-- ============ execute grants ============
revoke execute on function private.is_media_photographer(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.can_see_media_asset(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.guard_media_append_only() from public, anon, authenticated;
revoke execute on function private.sync_media_publications() from public, anon, authenticated;
revoke execute on function private.touch_media_updated_at() from public, anon, authenticated;
revoke execute on function private.can(uuid, app_module, app_action, uuid, uuid) from public, anon;
grant execute on function private.can(uuid, app_module, app_action, uuid, uuid) to authenticated;
grant execute on function private.is_media_photographer(uuid, uuid) to authenticated;
grant execute on function private.can_see_media_asset(uuid, uuid) to authenticated;