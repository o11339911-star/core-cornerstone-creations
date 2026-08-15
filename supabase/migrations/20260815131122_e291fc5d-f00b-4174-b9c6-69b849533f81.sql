-- ==========================================================
-- Phase 22 — Real-estate marketing & marketer contracting
-- ==========================================================

insert into public.role_permissions(role, module, action)
select s.r, 'marketing'::public.app_module, s.a
from (values
  ('owner','view'),('owner','create'),('owner','update'),('owner','approve'),('owner','soft_delete'),('owner','export'),('owner','share'),
  ('admin','view'),('admin','create'),('admin','update'),('admin','approve'),('admin','soft_delete'),('admin','export'),('admin','share'),
  ('manager','view'),('manager','create'),('manager','update'),
  ('member','view'),
  ('viewer','view')
) as v(r0, a0), lateral (select v.r0::public.app_role r, v.a0::public.app_action a) s
on conflict do nothing;

create table public.marketing_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  owner_entity_id uuid references public.entities(id) on delete set null,
  readiness_basis text not null check (readiness_basis in ('ready','off_plan')),
  status text not null default 'draft' check (status in ('draft','active','suspended','closed')),
  channel_mode text not null default 'internal' check (channel_mode in ('internal','external','both')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_contracts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.marketing_profiles(id) on delete cascade,
  marketer_entity_id uuid not null references public.entities(id) on delete restrict,
  exclusivity text not null default 'non_exclusive' check (exclusivity in ('exclusive','non_exclusive')),
  starts_on date not null,
  ends_on date,
  channels text[] not null default '{}',
  price_authority text not null default 'owner_fixed' check (price_authority in ('owner_fixed','range','negotiable')),
  content_rights text,
  lead_rights text,
  report_rights text,
  termination_terms text,
  status text not null default 'draft' check (status in ('draft','active','suspended','terminated','expired')),
  terminated_at timestamptz,
  terminated_by uuid,
  termination_reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_contract_period_ck check (ends_on is null or ends_on >= starts_on)
);
create index marketing_contracts_profile_idx on public.marketing_contracts(profile_id);
create index marketing_contracts_marketer_idx on public.marketing_contracts(marketer_entity_id);

create table public.marketing_contract_amounts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.marketing_contracts(id) on delete cascade,
  kind text not null check (kind in ('commission_percent','commission_fixed','budget')),
  amount numeric(18,4) not null check (amount >= 0),
  currency text not null default 'SAR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, kind)
);

create table public.marketing_contract_units (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.marketing_contracts(id) on delete cascade,
  property_unit_id uuid not null references public.property_units(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (contract_id, property_unit_id)
);

create table public.marketing_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.marketing_profiles(id) on delete cascade,
  version_no integer not null,
  title_ar text not null,
  title_en text,
  description_ar text,
  description_en text,
  listing_price numeric(18,2) check (listing_price is null or listing_price >= 0),
  price_currency text not null default 'SAR',
  units_snapshot jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','approved','superseded')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  unique (profile_id, version_no)
);

create table public.marketing_assets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.marketing_profiles(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (profile_id, document_id)
);

create table public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.marketing_profiles(id) on delete cascade,
  contract_id uuid references public.marketing_contracts(id) on delete set null,
  channel_code text,
  full_name text not null,
  contact_phone text,
  contact_email text,
  note text,
  stage text not null default 'new' check (stage in ('new','contacted','visit','offer','won','lost')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index marketing_leads_profile_idx on public.marketing_leads(profile_id);

create table public.marketing_packages (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.marketing_versions(id) on delete cascade,
  contract_id uuid not null references public.marketing_contracts(id) on delete cascade,
  package_no integer not null,
  verify_token text not null unique,
  license_number_snapshot text not null,
  marketer_entity_id uuid not null references public.entities(id) on delete restrict,
  channel_code text,
  watermark_text text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid,
  issued_by uuid not null,
  created_at timestamptz not null default now(),
  unique (version_id, package_no)
);

create trigger trg_marketing_profiles_updated before update on public.marketing_profiles
  for each row execute function public.set_updated_at();
create trigger trg_marketing_contracts_updated before update on public.marketing_contracts
  for each row execute function public.set_updated_at();
create trigger trg_marketing_contract_amounts_updated before update on public.marketing_contract_amounts
  for each row execute function public.set_updated_at();
create trigger trg_marketing_leads_updated before update on public.marketing_leads
  for each row execute function public.set_updated_at();

create or replace function private.entity_has_valid_license(_entity_id uuid, _discipline text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.entity_licenses el
    where el.entity_id = _entity_id
      and el.status = 'active'
      and el.verified_at is not null
      and lower(coalesce(el.discipline,'')) = lower(_discipline)
      and (el.expires_on is null or el.expires_on >= current_date)
  );
$$;

create or replace function private.marketing_readiness_ok(_project_id uuid, _basis text, _owner_entity_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v_status text;
begin
  select p.status into v_status from public.projects p where p.id = _project_id and p.deleted_at is null;
  if v_status is null then return false; end if;

  if _basis = 'ready' then
    return v_status in ('completed','closed','archived')
      or exists (select 1 from public.project_acceptances a
                  where a.project_id = _project_id and a.phase = 'final' and a.status = 'accepted');
  end if;

  if _basis = 'off_plan' then
    return _owner_entity_id is not null
      and private.entity_has_valid_license(_owner_entity_id, 'wafi')
      and exists (
        select 1 from public.building_licenses bl
        join public.property_projects pp on pp.property_id = bl.property_id
        where pp.project_id = _project_id
      );
  end if;

  return false;
end; $$;

create or replace function private.can_marketing(_profile_id uuid, _action public.app_action)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare r record;
begin
  select mp.project_id, mp.owner_entity_id into r from public.marketing_profiles mp where mp.id = _profile_id;
  if r.project_id is null then return false; end if;
  return private.can(auth.uid(), 'marketing'::public.app_module, _action, r.owner_entity_id, r.project_id);
end; $$;

create or replace function public.guard_marketing_version_immutable()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'MARKETING_VERSION_APPEND_ONLY' using errcode = '42501';
  end if;
  if new.profile_id is distinct from old.profile_id
     or new.version_no is distinct from old.version_no
     or new.title_ar is distinct from old.title_ar
     or new.title_en is distinct from old.title_en
     or new.description_ar is distinct from old.description_ar
     or new.description_en is distinct from old.description_en
     or new.listing_price is distinct from old.listing_price
     or new.price_currency is distinct from old.price_currency
     or new.units_snapshot is distinct from old.units_snapshot
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'MARKETING_VERSION_CONTENT_IMMUTABLE' using errcode = '42501';
  end if;
  if not ((old.status = 'draft' and new.status in ('approved','superseded'))
          or (old.status = 'approved' and new.status = 'superseded')
          or (old.status = new.status)) then
    raise exception 'MARKETING_VERSION_BAD_TRANSITION' using errcode = '42501';
  end if;
  return new;
end; $$;

create trigger trg_marketing_versions_immutable
  before update or delete on public.marketing_versions
  for each row execute function public.guard_marketing_version_immutable();

create or replace function public.enforce_marketing_asset_public()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from public.documents d
                  where d.id = new.document_id
                    and d.status = 'approved'
                    and d.visibility = 'public_approved'
                    and coalesce(d.is_deleted,false) = false) then
    raise exception 'MARKETING_ASSET_NOT_PUBLIC' using errcode = '22023';
  end if;
  return new;
end; $$;

create trigger trg_marketing_assets_public
  before insert or update on public.marketing_assets
  for each row execute function public.enforce_marketing_asset_public();

create or replace function public.enforce_marketing_profile_readiness()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not private.marketing_readiness_ok(new.project_id, new.readiness_basis, new.owner_entity_id) then
    raise exception 'MARKETING_PROJECT_NOT_READY' using errcode = '22023';
  end if;
  return new;
end; $$;

create trigger trg_marketing_profile_readiness
  before insert on public.marketing_profiles
  for each row execute function public.enforce_marketing_profile_readiness();

alter table public.marketing_profiles enable row level security;
alter table public.marketing_contracts enable row level security;
alter table public.marketing_contract_amounts enable row level security;
alter table public.marketing_contract_units enable row level security;
alter table public.marketing_versions enable row level security;
alter table public.marketing_assets enable row level security;
alter table public.marketing_leads enable row level security;
alter table public.marketing_packages enable row level security;

create policy marketing_profiles_read on public.marketing_profiles
  for select to authenticated using (private.can_marketing(id, 'view'::public.app_action));

create policy marketing_contracts_read on public.marketing_contracts
  for select to authenticated using (private.can_marketing(profile_id, 'view'::public.app_action));

create policy marketing_contract_amounts_read on public.marketing_contract_amounts
  for select to authenticated using (exists (
    select 1 from public.marketing_contracts c
    where c.id = contract_id and private.can_marketing(c.profile_id, 'view'::public.app_action)));

create policy marketing_contract_units_read on public.marketing_contract_units
  for select to authenticated using (exists (
    select 1 from public.marketing_contracts c
    where c.id = contract_id and private.can_marketing(c.profile_id, 'view'::public.app_action)));

create policy marketing_versions_read on public.marketing_versions
  for select to authenticated using (
    private.can_marketing(profile_id, 'view'::public.app_action)
    and (status <> 'draft' or private.can_marketing(profile_id, 'approve'::public.app_action)));

create policy marketing_assets_read on public.marketing_assets
  for select to authenticated using (private.can_marketing(profile_id, 'view'::public.app_action));

create policy marketing_leads_read on public.marketing_leads
  for select to authenticated using (private.can_marketing(profile_id, 'view'::public.app_action));

create policy marketing_packages_read on public.marketing_packages
  for select to authenticated using (exists (
    select 1 from public.marketing_versions v
    where v.id = version_id and private.can_marketing(v.profile_id, 'view'::public.app_action)));

create or replace function private.can(_user_id uuid, _module public.app_module, _action public.app_action, _entity_id uuid default null, _project_id uuid default null)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_entity_id uuid := _entity_id;
  v_owner_id uuid;
  v_project_entity_id uuid;
begin
  if _user_id is null then
    return false;
  end if;

  if _project_id is not null then
    select p.owner_id, p.entity_id
      into v_owner_id, v_project_entity_id
    from public.projects p
    where p.id = _project_id and p.deleted_at is null;

    if v_owner_id is null then
      return false;
    end if;

    v_entity_id := coalesce(v_project_entity_id, v_entity_id);

    if v_owner_id = _user_id then
      return true;
    end if;
  end if;

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

  if _project_id is not null
     and _action = 'view'::public.app_action
     and private.is_platform_staff(_user_id)
  then
    if exists (
      select 1
      from public.platform_case_access ca
      join public.permission_grants g on g.id = ca.grant_id
      where ca.staff_user_id = _user_id
        and ca.project_id = _project_id
        and ca.revoked_at is null
        and ca.expires_at > now()
        and g.revoked_at is null
        and g.effect = 'allow'
        and g.module = _module
        and g.action = _action
        and (g.expires_at is null or g.expires_at > now())
    ) then
      return true;
    end if;

    if exists (
      select 1
      from public.platform_breakglass_requests b
      join public.permission_grants g on g.id = b.grant_id
      where b.requested_by = _user_id
        and b.project_id = _project_id
        and b.status = 'approved'
        and b.expires_at > now()
        and g.revoked_at is null
        and g.effect = 'allow'
        and g.module = _module
        and g.action = _action
        and (g.expires_at is null or g.expires_at > now())
    ) then
      return true;
    end if;
  end if;

  if _module = 'marketing'::public.app_module
     and _project_id is not null
     and _action = any (array['view','create','update']::public.app_action[])
  then
    if exists (
      select 1
      from public.marketing_contracts mc
      join public.marketing_profiles mp on mp.id = mc.profile_id
      join public.entity_memberships em
        on em.entity_id = mc.marketer_entity_id
       and em.user_id = _user_id
       and em.status = 'active'
       and (em.expires_at is null or em.expires_at > now())
      where mp.project_id = _project_id
        and mc.status = 'active'
        and mc.starts_on <= current_date
        and (mc.ends_on is null or mc.ends_on >= current_date)
    ) then
      return true;
    end if;
  end if;

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
      and not exists (select 1 from public.platform_case_access ca where ca.grant_id = g.id)
      and not exists (select 1 from public.platform_breakglass_requests b where b.grant_id = g.id)
      and (
        (g.scope_type = 'project' and g.scope_project_id = _project_id)
        or (g.scope_type = 'entity' and g.scope_entity_id = v_entity_id)
      )
  );
end; $$;

create or replace function public.create_marketing_profile(_project_id uuid, _readiness_basis text, _channel_mode text default 'internal')
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_entity uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select p.entity_id into v_entity from public.projects p where p.id = _project_id and p.deleted_at is null;
  if not private.can(v_uid, 'marketing'::public.app_module, 'create'::public.app_action, v_entity, _project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  insert into public.marketing_profiles(project_id, owner_entity_id, readiness_basis, channel_mode, created_by)
  values (_project_id, v_entity, _readiness_basis, _channel_mode, v_uid)
  returning id into v_id;
  insert into public.permission_audit_log(actor_user_id, target_entity_id, target_project_id, object_type, object_id, action)
  values (v_uid, v_entity, _project_id, 'marketing_profiles', v_id, 'insert');
  return v_id;
end; $$;

create or replace function public.set_marketing_profile_status(_profile_id uuid, _status text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into r from public.marketing_profiles where id = _profile_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'update'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  if _status = 'active' and not private.marketing_readiness_ok(r.project_id, r.readiness_basis, r.owner_entity_id) then
    raise exception 'MARKETING_PROJECT_NOT_READY' using errcode='22023';
  end if;
  update public.marketing_profiles set status = _status where id = _profile_id;
  insert into public.permission_audit_log(actor_user_id, target_entity_id, target_project_id, object_type, object_id, action)
  values (v_uid, r.owner_entity_id, r.project_id, 'marketing_profiles', _profile_id, 'status_change');
end; $$;

create or replace function public.create_marketing_contract(
  _profile_id uuid, _marketer_entity_id uuid, _starts_on date, _ends_on date,
  _exclusivity text default 'non_exclusive', _channels text[] default '{}',
  _price_authority text default 'owner_fixed', _content_rights text default null,
  _lead_rights text default null, _report_rights text default null, _termination_terms text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record; v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into r from public.marketing_profiles where id = _profile_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'create'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  insert into public.marketing_contracts(profile_id, marketer_entity_id, starts_on, ends_on, exclusivity,
    channels, price_authority, content_rights, lead_rights, report_rights, termination_terms, created_by)
  values (_profile_id, _marketer_entity_id, _starts_on, _ends_on, _exclusivity, coalesce(_channels,'{}'),
    _price_authority, _content_rights, _lead_rights, _report_rights, _termination_terms, v_uid)
  returning id into v_id;
  insert into public.permission_audit_log(actor_user_id, target_entity_id, target_project_id, object_type, object_id, action)
  values (v_uid, r.owner_entity_id, r.project_id, 'marketing_contracts', v_id, 'insert');
  return v_id;
end; $$;

create or replace function public.set_marketing_contract_amount(_contract_id uuid, _kind text, _amount numeric, _currency text default 'SAR')
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select mc.id, mc.status, mp.project_id, mp.owner_entity_id into r
  from public.marketing_contracts mc join public.marketing_profiles mp on mp.id = mc.profile_id
  where mc.id = _contract_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'approve'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  if r.status <> 'draft' then raise exception 'MARKETING_CONTRACT_LOCKED' using errcode='42501'; end if;
  insert into public.marketing_contract_amounts(contract_id, kind, amount, currency)
  values (_contract_id, _kind, _amount, _currency)
  on conflict (contract_id, kind) do update set amount = excluded.amount, currency = excluded.currency;
end; $$;

create or replace function public.add_marketing_contract_unit(_contract_id uuid, _property_unit_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select mc.id, mp.project_id, mp.owner_entity_id into r
  from public.marketing_contracts mc join public.marketing_profiles mp on mp.id = mc.profile_id
  where mc.id = _contract_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'approve'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  insert into public.marketing_contract_units(contract_id, property_unit_id)
  values (_contract_id, _property_unit_id) on conflict do nothing;
end; $$;

create or replace function public.activate_marketing_contract(_contract_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select mc.id, mc.status, mp.project_id, mp.owner_entity_id into r
  from public.marketing_contracts mc join public.marketing_profiles mp on mp.id = mc.profile_id
  where mc.id = _contract_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'approve'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  if r.status not in ('draft','suspended') then raise exception 'MARKETING_CONTRACT_BAD_STATE' using errcode='22023'; end if;
  update public.marketing_contracts set status = 'active' where id = _contract_id;
  insert into public.permission_audit_log(actor_user_id, target_entity_id, target_project_id, object_type, object_id, action)
  values (v_uid, r.owner_entity_id, r.project_id, 'marketing_contracts', _contract_id, 'status_change');
end; $$;

create or replace function public.terminate_marketing_contract(_contract_id uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record; m record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select mc.id, mc.status, mc.marketer_entity_id, mp.project_id, mp.owner_entity_id into r
  from public.marketing_contracts mc join public.marketing_profiles mp on mp.id = mc.profile_id
  where mc.id = _contract_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'approve'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  update public.marketing_contracts
     set status = 'terminated', terminated_at = now(), terminated_by = v_uid, termination_reason = _reason
   where id = _contract_id;
  update public.duration_timers set state = 'stopped', stopped_at = now()
   where subject_kind = 'marketing_contract' and subject_id = _contract_id and state <> 'stopped';
  for m in select em.user_id from public.entity_memberships em
            where em.entity_id = r.marketer_entity_id and em.status = 'active' loop
    perform private.emit_notification(m.user_id, 'marketing.contract_terminated', r.project_id, r.marketer_entity_id,
      'marketing_contract', _contract_id, jsonb_build_object('reason', _reason), 'terminated', 'warning');
  end loop;
  insert into public.permission_audit_log(actor_user_id, target_entity_id, target_project_id, object_type, object_id, action)
  values (v_uid, r.owner_entity_id, r.project_id, 'marketing_contracts', _contract_id, 'status_change');
end; $$;

create or replace function public.create_marketing_version(
  _profile_id uuid, _title_ar text, _title_en text default null, _description_ar text default null,
  _description_en text default null, _listing_price numeric default null, _price_currency text default 'SAR',
  _units_snapshot jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record; v_no integer; v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into r from public.marketing_profiles where id = _profile_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'approve'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  select coalesce(max(version_no),0)+1 into v_no from public.marketing_versions where profile_id = _profile_id;
  insert into public.marketing_versions(profile_id, version_no, title_ar, title_en, description_ar, description_en,
    listing_price, price_currency, units_snapshot, created_by)
  values (_profile_id, v_no, _title_ar, _title_en, _description_ar, _description_en,
    _listing_price, _price_currency, coalesce(_units_snapshot,'[]'::jsonb), v_uid)
  returning id into v_id;
  insert into public.permission_audit_log(actor_user_id, target_entity_id, target_project_id, object_type, object_id, action)
  values (v_uid, r.owner_entity_id, r.project_id, 'marketing_versions', v_id, 'insert');
  return v_id;
end; $$;

create or replace function public.approve_marketing_version(_version_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record; m record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select v.id, v.profile_id, v.status, mp.project_id, mp.owner_entity_id into r
  from public.marketing_versions v join public.marketing_profiles mp on mp.id = v.profile_id
  where v.id = _version_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'approve'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  if r.status <> 'draft' then raise exception 'MARKETING_VERSION_BAD_STATE' using errcode='22023'; end if;
  update public.marketing_versions set status = 'superseded'
   where profile_id = r.profile_id and status = 'approved';
  update public.marketing_versions set status = 'approved', approved_by = v_uid, approved_at = now()
   where id = _version_id;
  for m in select distinct em.user_id
             from public.marketing_contracts mc
             join public.entity_memberships em on em.entity_id = mc.marketer_entity_id and em.status = 'active'
            where mc.profile_id = r.profile_id and mc.status = 'active' loop
    perform private.emit_notification(m.user_id, 'marketing.version_approved', r.project_id, null,
      'marketing_version', _version_id, '{}'::jsonb, 'approved', 'info');
  end loop;
  insert into public.permission_audit_log(actor_user_id, target_entity_id, target_project_id, object_type, object_id, action)
  values (v_uid, r.owner_entity_id, r.project_id, 'marketing_versions', _version_id, 'approve');
end; $$;

create or replace function public.link_marketing_asset(_profile_id uuid, _document_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into r from public.marketing_profiles where id = _profile_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'approve'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  insert into public.marketing_assets(profile_id, document_id, created_by)
  values (_profile_id, _document_id, v_uid) on conflict do nothing;
end; $$;

create or replace function public.issue_marketing_package(
  _version_id uuid, _contract_id uuid, _expires_at timestamptz,
  _channel_code text default null, _watermark_text text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record; v_lic record; v_no integer; v_token text; v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select v.id vid, v.status vstatus, v.profile_id, mp.project_id, mp.owner_entity_id,
         mc.id cid, mc.status cstatus, mc.marketer_entity_id
    into r
  from public.marketing_versions v
  join public.marketing_profiles mp on mp.id = v.profile_id
  join public.marketing_contracts mc on mc.id = _contract_id and mc.profile_id = v.profile_id
  where v.id = _version_id;
  if r.vid is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'approve'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  if r.vstatus <> 'approved' then raise exception 'MARKETING_VERSION_NOT_APPROVED' using errcode='22023'; end if;
  if r.cstatus <> 'active' then raise exception 'MARKETING_CONTRACT_NOT_ACTIVE' using errcode='22023'; end if;

  select * into v_lic from public.entity_licenses el
   where el.entity_id = r.marketer_entity_id
     and el.status = 'active'
     and el.verified_at is not null
     and lower(coalesce(el.discipline,'')) = 'val'
     and (el.expires_on is null or el.expires_on >= current_date)
   order by el.expires_on desc nulls first limit 1;
  if v_lic.id is null then raise exception 'MARKETER_LICENSE_INVALID' using errcode='22023'; end if;

  select coalesce(max(package_no),0)+1 into v_no from public.marketing_packages where version_id = _version_id;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.marketing_packages(version_id, contract_id, package_no, verify_token, license_number_snapshot,
    marketer_entity_id, channel_code, watermark_text, expires_at, issued_by)
  values (_version_id, _contract_id, v_no, v_token, v_lic.license_number, r.marketer_entity_id, _channel_code,
    coalesce(_watermark_text, 'RAKEEZ - ' || to_char(now(),'YYYY-MM-DD')), _expires_at, v_uid)
  returning id into v_id;
  insert into public.permission_audit_log(actor_user_id, target_entity_id, target_project_id, object_type, object_id, action)
  values (v_uid, r.owner_entity_id, r.project_id, 'marketing_packages', v_id, 'insert');
  return jsonb_build_object('package_no', v_no, 'verify_token', v_token, 'expires_at', _expires_at);
end; $$;

create or replace function public.revoke_marketing_package(_package_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select pk.id, mp.project_id, mp.owner_entity_id into r
  from public.marketing_packages pk
  join public.marketing_versions v on v.id = pk.version_id
  join public.marketing_profiles mp on mp.id = v.profile_id
  where pk.id = _package_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'approve'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  update public.marketing_packages set revoked_at = now(), revoked_by = v_uid where id = _package_id and revoked_at is null;
  insert into public.permission_audit_log(actor_user_id, target_entity_id, target_project_id, object_type, object_id, action)
  values (v_uid, r.owner_entity_id, r.project_id, 'marketing_packages', _package_id, 'revoke');
end; $$;

create or replace function public.record_marketing_lead(
  _contract_id uuid, _full_name text, _contact_phone text default null, _contact_email text default null,
  _channel_code text default null, _note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record; v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select mc.id, mc.profile_id, mp.project_id, mp.owner_entity_id into r
  from public.marketing_contracts mc join public.marketing_profiles mp on mp.id = mc.profile_id
  where mc.id = _contract_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'create'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  insert into public.marketing_leads(profile_id, contract_id, channel_code, full_name, contact_phone, contact_email, note, created_by)
  values (r.profile_id, _contract_id, _channel_code, _full_name, _contact_phone, _contact_email, _note, v_uid)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.update_marketing_lead_stage(_lead_id uuid, _stage text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); r record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select l.id, mp.project_id, mp.owner_entity_id into r
  from public.marketing_leads l join public.marketing_profiles mp on mp.id = l.profile_id
  where l.id = _lead_id;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'update'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  update public.marketing_leads set stage = _stage where id = _lead_id;
end; $$;

create or replace function public.verify_marketing_package(_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r record;
begin
  if _token is null or length(_token) < 16 then return null; end if;
  select pk.package_no pno, pk.expires_at exp_at, pk.revoked_at rev_at, pk.license_number_snapshot lic,
         pk.channel_code ch, v.title_ar ttl, e.name marketer_name
    into r
    from public.marketing_packages pk
    join public.marketing_versions v on v.id = pk.version_id
    join public.entities e on e.id = pk.marketer_entity_id
   where pk.verify_token = _token;
  if r.pno is null then return null; end if;

  if r.rev_at is not null then
    return jsonb_build_object('status','revoked','package_no', r.pno);
  end if;
  if r.exp_at <= now() then
    return jsonb_build_object('status','expired','package_no', r.pno);
  end if;
  return jsonb_build_object(
    'status','valid',
    'package_no', r.pno,
    'listing_title', r.ttl,
    'marketer_name', r.marketer_name,
    'license_number', r.lic,
    'channel_code', r.ch,
    'expires_at', r.exp_at
  );
end; $$;

revoke insert, update, delete, truncate on public.marketing_profiles from anon, authenticated;
revoke insert, update, delete, truncate on public.marketing_contracts from anon, authenticated;
revoke insert, update, delete, truncate on public.marketing_contract_amounts from anon, authenticated;
revoke insert, update, delete, truncate on public.marketing_contract_units from anon, authenticated;
revoke insert, update, delete, truncate on public.marketing_versions from anon, authenticated;
revoke insert, update, delete, truncate on public.marketing_assets from anon, authenticated;
revoke insert, update, delete, truncate on public.marketing_leads from anon, authenticated;
revoke insert, update, delete, truncate on public.marketing_packages from anon, authenticated;
revoke select on public.marketing_profiles, public.marketing_contracts, public.marketing_contract_amounts,
  public.marketing_contract_units, public.marketing_versions, public.marketing_assets,
  public.marketing_leads, public.marketing_packages from anon;

grant select on public.marketing_profiles, public.marketing_contracts, public.marketing_contract_amounts,
  public.marketing_contract_units, public.marketing_versions, public.marketing_assets,
  public.marketing_leads, public.marketing_packages to authenticated;
grant all on public.marketing_profiles, public.marketing_contracts, public.marketing_contract_amounts,
  public.marketing_contract_units, public.marketing_versions, public.marketing_assets,
  public.marketing_leads, public.marketing_packages to service_role;

revoke all on function private.entity_has_valid_license(uuid, text) from public, anon, authenticated;
revoke all on function private.marketing_readiness_ok(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.can_marketing(uuid, public.app_action) from public, anon, authenticated;
revoke all on function private.can(uuid, public.app_module, public.app_action, uuid, uuid) from public, anon, authenticated;

revoke all on function public.create_marketing_profile(uuid, text, text) from public, anon;
revoke all on function public.set_marketing_profile_status(uuid, text) from public, anon;
revoke all on function public.create_marketing_contract(uuid, uuid, date, date, text, text[], text, text, text, text, text) from public, anon;
revoke all on function public.set_marketing_contract_amount(uuid, text, numeric, text) from public, anon;
revoke all on function public.add_marketing_contract_unit(uuid, uuid) from public, anon;
revoke all on function public.activate_marketing_contract(uuid) from public, anon;
revoke all on function public.terminate_marketing_contract(uuid, text) from public, anon;
revoke all on function public.create_marketing_version(uuid, text, text, text, text, numeric, text, jsonb) from public, anon;
revoke all on function public.approve_marketing_version(uuid) from public, anon;
revoke all on function public.link_marketing_asset(uuid, uuid) from public, anon;
revoke all on function public.issue_marketing_package(uuid, uuid, timestamptz, text, text) from public, anon;
revoke all on function public.revoke_marketing_package(uuid) from public, anon;
revoke all on function public.record_marketing_lead(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.update_marketing_lead_stage(uuid, text) from public, anon;
revoke all on function public.verify_marketing_package(text) from public, anon, authenticated;
revoke all on function public.guard_marketing_version_immutable() from public, anon, authenticated;
revoke all on function public.enforce_marketing_asset_public() from public, anon, authenticated;
revoke all on function public.enforce_marketing_profile_readiness() from public, anon, authenticated;

grant execute on function public.create_marketing_profile(uuid, text, text) to authenticated, service_role;
grant execute on function public.set_marketing_profile_status(uuid, text) to authenticated, service_role;
grant execute on function public.create_marketing_contract(uuid, uuid, date, date, text, text[], text, text, text, text, text) to authenticated, service_role;
grant execute on function public.set_marketing_contract_amount(uuid, text, numeric, text) to authenticated, service_role;
grant execute on function public.add_marketing_contract_unit(uuid, uuid) to authenticated, service_role;
grant execute on function public.activate_marketing_contract(uuid) to authenticated, service_role;
grant execute on function public.terminate_marketing_contract(uuid, text) to authenticated, service_role;
grant execute on function public.create_marketing_version(uuid, text, text, text, text, numeric, text, jsonb) to authenticated, service_role;
grant execute on function public.approve_marketing_version(uuid) to authenticated, service_role;
grant execute on function public.link_marketing_asset(uuid, uuid) to authenticated, service_role;
grant execute on function public.issue_marketing_package(uuid, uuid, timestamptz, text, text) to authenticated, service_role;
grant execute on function public.revoke_marketing_package(uuid) to authenticated, service_role;
grant execute on function public.record_marketing_lead(uuid, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.update_marketing_lead_stage(uuid, text) to authenticated, service_role;
grant execute on function public.verify_marketing_package(text) to anon, authenticated, service_role;