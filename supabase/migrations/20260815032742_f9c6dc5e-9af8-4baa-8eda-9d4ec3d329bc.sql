-- ============================================================
-- Phase 7 — Unified property profile
-- ============================================================

-- ---------- role permissions for the new module ----------
insert into public.role_permissions (role, module, action)
select r.role, 'properties'::public.app_module, a.action
from (values
  ('owner'::public.app_role), ('admin'::public.app_role), ('manager'::public.app_role)
) r(role)
cross join (values
  ('view'::public.app_action), ('create'::public.app_action), ('update'::public.app_action),
  ('soft_delete'::public.app_action), ('export'::public.app_action), ('share'::public.app_action),
  ('view_exact'::public.app_action)
) a(action)
on conflict do nothing;

insert into public.role_permissions (role, module, action) values
  ('member'::public.app_role, 'properties'::public.app_module, 'view'::public.app_action),
  ('member'::public.app_role, 'properties'::public.app_module, 'create'::public.app_action),
  ('member'::public.app_role, 'properties'::public.app_module, 'update'::public.app_action),
  ('viewer'::public.app_role, 'properties'::public.app_module, 'view'::public.app_action)
on conflict do nothing;

-- ---------- append-only guard ----------
create or replace function public.prevent_row_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Rows in % are append-only and cannot be modified or deleted', tg_table_name
    using errcode = '42501';
end;
$$;
revoke all on function public.prevent_row_mutation() from public, anon, authenticated;

-- ---------- properties ----------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  entity_id uuid references public.entities(id),
  kind text not null check (kind in ('land','villa','building','compound','unit_block')),
  name text not null,
  code text,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  city text,
  district text,
  land_area numeric(14,2),
  plan_no text,
  parcel_no text,
  notes text,
  approx_lat numeric(9,6),
  approx_lng numeric(9,6),
  exact_lat numeric(9,6),
  exact_lng numeric(9,6),
  exact_address text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index properties_owner_idx on public.properties(owner_id);
create index properties_entity_idx on public.properties(entity_id);

grant select, insert, update on public.properties to authenticated;
grant all on public.properties to service_role;
alter table public.properties enable row level security;

-- link table is referenced by the access helpers below, so create it first
create table public.property_projects (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  project_id uuid not null references public.projects(id),
  relation text not null default 'related' check (relation in ('primary','related')),
  linked_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (property_id, project_id)
);

-- ---------- access helpers (private schema: not reachable from the API) ----------
create or replace function private.can_access_property(_user_id uuid, _property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties p
    where p.id = _property_id
      and p.deleted_at is null
      and (
        p.owner_id = _user_id
        or (p.entity_id is not null and (
              private.has_role(_user_id, p.entity_id, 'owner')
           or private.has_role(_user_id, p.entity_id, 'admin')
           or private.has_role(_user_id, p.entity_id, 'manager')))
        or private.can(_user_id, 'properties'::public.app_module, 'view'::public.app_action, p.entity_id, null)
        or exists (
             select 1 from public.property_projects pp
             where pp.property_id = p.id
               and private.can_access_project(_user_id, pp.project_id)
           )
      )
  );
$$;

create or replace function private.can_manage_property(_user_id uuid, _property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties p
    where p.id = _property_id
      and p.deleted_at is null
      and (
        p.owner_id = _user_id
        or (p.entity_id is not null and (
              private.has_role(_user_id, p.entity_id, 'owner')
           or private.has_role(_user_id, p.entity_id, 'admin')
           or private.has_role(_user_id, p.entity_id, 'manager')))
        or private.can(_user_id, 'properties'::public.app_module, 'update'::public.app_action, p.entity_id, null)
      )
  );
$$;

create or replace function private.can_view_exact_location(_user_id uuid, _property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties p
    where p.id = _property_id
      and p.deleted_at is null
      and (
        p.owner_id = _user_id
        or (p.entity_id is not null and (
              private.has_role(_user_id, p.entity_id, 'owner')
           or private.has_role(_user_id, p.entity_id, 'admin')
           or private.has_role(_user_id, p.entity_id, 'manager')))
        or private.can(_user_id, 'properties'::public.app_module, 'view_exact'::public.app_action, p.entity_id, null)
      )
  );
$$;

create policy "properties_select_scope" on public.properties
  for select to authenticated
  using (
    deleted_at is null
    and (
      owner_id = auth.uid()
      or (entity_id is not null and (
            private.has_role(auth.uid(), entity_id, 'owner')
         or private.has_role(auth.uid(), entity_id, 'admin')
         or private.has_role(auth.uid(), entity_id, 'manager')))
      or private.can(auth.uid(), 'properties'::public.app_module, 'view'::public.app_action, entity_id, null)
      or exists (
           select 1 from public.property_projects pp
           where pp.property_id = properties.id
             and private.can_access_project(auth.uid(), pp.project_id)
         )
    )
  );

create policy "properties_insert_own" on public.properties
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and owner_id = auth.uid()
    and (
      entity_id is null
      or private.can(auth.uid(), 'properties'::public.app_module, 'create'::public.app_action, entity_id, null)
    )
  );

create policy "properties_update_manage" on public.properties
  for update to authenticated
  using (private.can_manage_property(auth.uid(), id))
  with check (private.can_manage_property(auth.uid(), id));

create trigger properties_set_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

-- ---------- property_projects (soft link) ----------
grant select, insert, delete on public.property_projects to authenticated;
grant all on public.property_projects to service_role;
alter table public.property_projects enable row level security;

create policy "property_projects_select" on public.property_projects
  for select to authenticated
  using (
    private.can_access_property(auth.uid(), property_id)
    or private.can_access_project(auth.uid(), project_id)
  );
create policy "property_projects_insert" on public.property_projects
  for insert to authenticated
  with check (
    linked_by = auth.uid()
    and private.can_manage_property(auth.uid(), property_id)
    and private.can_access_project(auth.uid(), project_id)
  );
create policy "property_projects_delete" on public.property_projects
  for delete to authenticated
  using (private.can_manage_property(auth.uid(), property_id));

-- ---------- property_owners ----------
create table public.property_owners (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  owner_user_id uuid references auth.users(id),
  owner_entity_id uuid references public.entities(id),
  owner_name_text text,
  national_id_masked text,
  share_percent numeric(6,3) not null check (share_percent > 0 and share_percent <= 100),
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_owners_identity_present check (
    owner_user_id is not null or owner_entity_id is not null or owner_name_text is not null
  )
);
create index property_owners_property_idx on public.property_owners(property_id);
grant select, insert, update, delete on public.property_owners to authenticated;
grant all on public.property_owners to service_role;
alter table public.property_owners enable row level security;

create or replace function public.enforce_owner_share_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
begin
  select coalesce(sum(share_percent), 0) into v_total
  from public.property_owners
  where property_id = new.property_id
    and (ends_on is null or ends_on >= current_date);

  if v_total > 100 then
    raise exception 'Total ownership share for this property would be %%%, which exceeds 100%%', v_total
      using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function public.enforce_owner_share_total() from public, anon, authenticated;

create constraint trigger property_owners_share_total
  after insert or update on public.property_owners
  deferrable initially immediate
  for each row execute function public.enforce_owner_share_total();

create trigger property_owners_set_updated_at before update on public.property_owners
  for each row execute function public.set_updated_at();

create policy "property_owners_select" on public.property_owners
  for select to authenticated using (private.can_access_property(auth.uid(), property_id));
create policy "property_owners_write" on public.property_owners
  for insert to authenticated with check (private.can_manage_property(auth.uid(), property_id));
create policy "property_owners_update" on public.property_owners
  for update to authenticated
  using (private.can_manage_property(auth.uid(), property_id))
  with check (private.can_manage_property(auth.uid(), property_id));
create policy "property_owners_delete" on public.property_owners
  for delete to authenticated using (private.can_manage_property(auth.uid(), property_id));

-- ---------- deeds + versions ----------
create table public.deeds (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  deed_number text,
  issuer text,
  current_version_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.deed_versions (
  id uuid primary key default gen_random_uuid(),
  deed_id uuid not null references public.deeds(id),
  version_no integer not null,
  deed_date date,
  area numeric(14,2),
  owner_name_snapshot text,
  file_path text,
  file_hash text,
  source text not null default 'manual' check (source in ('manual','extracted')),
  extracted_payload jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (deed_id, version_no)
);
alter table public.deeds
  add constraint deeds_current_version_fkey
  foreign key (current_version_id) references public.deed_versions(id);

create table public.building_licenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  license_number text,
  authority text,
  current_version_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.license_versions (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.building_licenses(id),
  version_no integer not null,
  issued_on date,
  expires_on date,
  scope_text text,
  file_path text,
  file_hash text,
  source text not null default 'manual' check (source in ('manual','extracted')),
  extracted_payload jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (license_id, version_no)
);
alter table public.building_licenses
  add constraint building_licenses_current_version_fkey
  foreign key (current_version_id) references public.license_versions(id);

grant select, insert, update on public.deeds to authenticated;
grant select, insert on public.deed_versions to authenticated;
grant select, insert, update on public.building_licenses to authenticated;
grant select, insert on public.license_versions to authenticated;
grant all on public.deeds, public.deed_versions, public.building_licenses, public.license_versions to service_role;

alter table public.deeds enable row level security;
alter table public.deed_versions enable row level security;
alter table public.building_licenses enable row level security;
alter table public.license_versions enable row level security;

create trigger deeds_set_updated_at before update on public.deeds
  for each row execute function public.set_updated_at();
create trigger building_licenses_set_updated_at before update on public.building_licenses
  for each row execute function public.set_updated_at();

-- append-only enforcement on version tables
create trigger deed_versions_append_only before update or delete on public.deed_versions
  for each row execute function public.prevent_row_mutation();
create trigger license_versions_append_only before update or delete on public.license_versions
  for each row execute function public.prevent_row_mutation();

-- auto version numbering + header pointer
create or replace function public.assign_deed_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(version_no), 0) + 1 into new.version_no
  from public.deed_versions where deed_id = new.deed_id;
  return new;
end;
$$;
revoke all on function public.assign_deed_version() from public, anon, authenticated;

create or replace function public.sync_deed_current_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.deeds set current_version_id = new.id, updated_at = now() where id = new.deed_id;
  return new;
end;
$$;
revoke all on function public.sync_deed_current_version() from public, anon, authenticated;

create or replace function public.assign_license_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(version_no), 0) + 1 into new.version_no
  from public.license_versions where license_id = new.license_id;
  return new;
end;
$$;
revoke all on function public.assign_license_version() from public, anon, authenticated;

create or replace function public.sync_license_current_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.building_licenses set current_version_id = new.id, updated_at = now() where id = new.license_id;
  return new;
end;
$$;
revoke all on function public.sync_license_current_version() from public, anon, authenticated;

create trigger deed_versions_assign_no before insert on public.deed_versions
  for each row execute function public.assign_deed_version();
create trigger deed_versions_sync_current after insert on public.deed_versions
  for each row execute function public.sync_deed_current_version();
create trigger license_versions_assign_no before insert on public.license_versions
  for each row execute function public.assign_license_version();
create trigger license_versions_sync_current after insert on public.license_versions
  for each row execute function public.sync_license_current_version();

create policy "deeds_select" on public.deeds
  for select to authenticated using (private.can_access_property(auth.uid(), property_id));
create policy "deeds_insert" on public.deeds
  for insert to authenticated
  with check (created_by = auth.uid() and private.can_manage_property(auth.uid(), property_id));
create policy "deeds_update" on public.deeds
  for update to authenticated
  using (private.can_manage_property(auth.uid(), property_id))
  with check (private.can_manage_property(auth.uid(), property_id));

create policy "deed_versions_select" on public.deed_versions
  for select to authenticated
  using (exists (select 1 from public.deeds d
                 where d.id = deed_versions.deed_id
                   and private.can_access_property(auth.uid(), d.property_id)));
create policy "deed_versions_insert" on public.deed_versions
  for insert to authenticated
  with check (created_by = auth.uid() and exists (
    select 1 from public.deeds d
    where d.id = deed_versions.deed_id
      and private.can_manage_property(auth.uid(), d.property_id)));

create policy "building_licenses_select" on public.building_licenses
  for select to authenticated using (private.can_access_property(auth.uid(), property_id));
create policy "building_licenses_insert" on public.building_licenses
  for insert to authenticated
  with check (created_by = auth.uid() and private.can_manage_property(auth.uid(), property_id));
create policy "building_licenses_update" on public.building_licenses
  for update to authenticated
  using (private.can_manage_property(auth.uid(), property_id))
  with check (private.can_manage_property(auth.uid(), property_id));

create policy "license_versions_select" on public.license_versions
  for select to authenticated
  using (exists (select 1 from public.building_licenses l
                 where l.id = license_versions.license_id
                   and private.can_access_property(auth.uid(), l.property_id)));
create policy "license_versions_insert" on public.license_versions
  for insert to authenticated
  with check (created_by = auth.uid() and exists (
    select 1 from public.building_licenses l
    where l.id = license_versions.license_id
      and private.can_manage_property(auth.uid(), l.property_id)));

-- ---------- land boundaries ----------
create table public.land_boundaries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  side text not null check (side in ('north','south','east','west','other')),
  length_m numeric(12,2),
  description text,
  neighbor_text text,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index land_boundaries_property_idx on public.land_boundaries(property_id);
grant select, insert, update, delete on public.land_boundaries to authenticated;
grant all on public.land_boundaries to service_role;
alter table public.land_boundaries enable row level security;
create trigger land_boundaries_set_updated_at before update on public.land_boundaries
  for each row execute function public.set_updated_at();

create policy "land_boundaries_select" on public.land_boundaries
  for select to authenticated using (private.can_access_property(auth.uid(), property_id));
create policy "land_boundaries_insert" on public.land_boundaries
  for insert to authenticated with check (private.can_manage_property(auth.uid(), property_id));
create policy "land_boundaries_update" on public.land_boundaries
  for update to authenticated
  using (private.can_manage_property(auth.uid(), property_id))
  with check (private.can_manage_property(auth.uid(), property_id));
create policy "land_boundaries_delete" on public.land_boundaries
  for delete to authenticated using (private.can_manage_property(auth.uid(), property_id));

-- ---------- property units ----------
create table public.property_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  unit_no text not null,
  unit_type text not null default 'apartment' check (unit_type in ('apartment','floor','shop','villa','office','other')),
  floor_no integer,
  area numeric(12,2),
  rooms integer,
  status text not null default 'planned' check (status in ('planned','available','sold','rented')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, unit_no)
);
grant select, insert, update, delete on public.property_units to authenticated;
grant all on public.property_units to service_role;
alter table public.property_units enable row level security;
create trigger property_units_set_updated_at before update on public.property_units
  for each row execute function public.set_updated_at();

create policy "property_units_select" on public.property_units
  for select to authenticated using (private.can_access_property(auth.uid(), property_id));
create policy "property_units_insert" on public.property_units
  for insert to authenticated with check (private.can_manage_property(auth.uid(), property_id));
create policy "property_units_update" on public.property_units
  for update to authenticated
  using (private.can_manage_property(auth.uid(), property_id))
  with check (private.can_manage_property(auth.uid(), property_id));
create policy "property_units_delete" on public.property_units
  for delete to authenticated using (private.can_manage_property(auth.uid(), property_id));

-- ---------- property services (structure only; activated in phase 13) ----------
create table public.property_services (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  service_type text not null check (service_type in ('electricity','water','sewage','telecom','gas')),
  status text not null default 'not_started' check (status in ('not_started','requested','in_progress','connected')),
  reference_no text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, service_type)
);
grant select, insert, update on public.property_services to authenticated;
grant all on public.property_services to service_role;
alter table public.property_services enable row level security;
create trigger property_services_set_updated_at before update on public.property_services
  for each row execute function public.set_updated_at();

create policy "property_services_select" on public.property_services
  for select to authenticated using (private.can_access_property(auth.uid(), property_id));
create policy "property_services_insert" on public.property_services
  for insert to authenticated with check (private.can_manage_property(auth.uid(), property_id));
create policy "property_services_update" on public.property_services
  for update to authenticated
  using (private.can_manage_property(auth.uid(), property_id))
  with check (private.can_manage_property(auth.uid(), property_id));

-- ---------- completion rules ----------
create table public.property_completion_rules (
  kind text not null,
  requirement_code text not null,
  weight integer not null check (weight > 0),
  created_at timestamptz not null default now(),
  primary key (kind, requirement_code)
);
grant select on public.property_completion_rules to authenticated;
grant all on public.property_completion_rules to service_role;
alter table public.property_completion_rules enable row level security;
create policy "completion_rules_readable" on public.property_completion_rules
  for select to authenticated using (true);

insert into public.property_completion_rules (kind, requirement_code, weight) values
  ('land','basics',30), ('land','owners_full',20), ('land','deed',30),
  ('land','boundaries',15), ('land','location',5),
  ('villa','basics',25), ('villa','owners_full',15), ('villa','deed',25),
  ('villa','license',20), ('villa','boundaries',10), ('villa','location',5),
  ('building','basics',20), ('building','owners_full',10), ('building','deed',20),
  ('building','license',20), ('building','boundaries',10), ('building','units',15), ('building','location',5),
  ('compound','basics',20), ('compound','owners_full',10), ('compound','deed',20),
  ('compound','license',20), ('compound','boundaries',10), ('compound','units',15), ('compound','location',5),
  ('unit_block','basics',20), ('unit_block','owners_full',15), ('unit_block','deed',20),
  ('unit_block','license',15), ('unit_block','units',25), ('unit_block','location',5);

-- ---------- dynamic completion (SECURITY INVOKER: obeys the caller's RLS) ----------
create or replace function public.property_completion(_property_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  with p as (
    select * from public.properties where id = _property_id and deleted_at is null
  ),
  met as (
    select r.requirement_code, r.weight,
      case r.requirement_code
        when 'basics' then (p.name is not null and p.city is not null
                            and p.district is not null and p.land_area is not null)
        when 'owners_full' then (
          select coalesce(sum(o.share_percent), 0) = 100
          from public.property_owners o
          where o.property_id = p.id and (o.ends_on is null or o.ends_on >= current_date))
        when 'deed' then exists (
          select 1 from public.deeds d where d.property_id = p.id and d.current_version_id is not null)
        when 'license' then exists (
          select 1 from public.building_licenses l
          where l.property_id = p.id and l.current_version_id is not null)
        when 'boundaries' then (
          select count(distinct b.side) >= 4 from public.land_boundaries b where b.property_id = p.id)
        when 'units' then exists (select 1 from public.property_units u where u.property_id = p.id)
        when 'location' then (p.approx_lat is not null and p.approx_lng is not null)
        else false
      end as satisfied
    from p
    join public.property_completion_rules r on r.kind = p.kind
  )
  select case when sum(weight) = 0 then 0
              else round(100.0 * sum(weight) filter (where satisfied) / sum(weight), 1) end
  from met;
$$;
grant execute on function public.property_completion(uuid) to authenticated, service_role;

-- ---------- masked view: exact coordinates hidden from unauthorized viewers ----------
create view public.properties_public
with (security_invoker = on) as
select
  p.id, p.owner_id, p.entity_id, p.kind, p.name, p.code, p.status,
  p.city, p.district, p.land_area, p.plan_no, p.parcel_no, p.notes,
  p.approx_lat, p.approx_lng,
  case when private.can_view_exact_location(auth.uid(), p.id) then p.exact_lat end as exact_lat,
  case when private.can_view_exact_location(auth.uid(), p.id) then p.exact_lng end as exact_lng,
  case when private.can_view_exact_location(auth.uid(), p.id) then p.exact_address end as exact_address,
  private.can_view_exact_location(auth.uid(), p.id) as can_view_exact,
  public.property_completion(p.id) as completion_percent,
  p.created_at, p.updated_at
from public.properties p
where p.deleted_at is null;

grant select on public.properties_public to authenticated;
grant select on public.properties_public to service_role;

-- ---------- storage policies for property documents ----------
create policy "property_docs_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'property-documents'
    and private.can_access_property(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
create policy "property_docs_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'property-documents'
    and private.can_manage_property(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );